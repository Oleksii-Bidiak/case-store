import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';

/** Public Bot API host. Injectable so specs can point the client at a local server. */
export const TELEGRAM_API_URL = 'https://api.telegram.org';

/** Bound on every ordinary Bot API call — a hung socket must never stall a worker tick. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * HTTP statuses / Telegram `error_code`s that retrying cannot fix.
 *
 * - 400 — the request itself is wrong for this recipient: "chat not found",
 *   "message is too long", a malformed `chat_id`;
 * - 403 — the bot was blocked by the user or kicked from the group;
 * - 401 / 404 — the token is wrong or revoked (Telegram answers 404 for an
 *   unknown `/bot<token>/` prefix, 401 for a revoked one).
 *
 * Everything else — network failures, timeouts, 429, 5xx, and codes we have no
 * opinion about (409 "terminated by other getUpdates request") — is transient:
 * the outbox retries it with backoff and the row stays visible via `lastError`.
 */
const PERMANENT_CODES = new Set([400, 401, 403, 404]);

/** `getMe` result — only the fields this project reads. */
export interface TelegramBotUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

/** `sendMessage` result — only the fields this project reads. */
export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: { id: number; type: string };
  text?: string;
}

/** One `getUpdates` entry; `allowed_updates` is pinned to `message`. */
export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    text?: string;
    chat: { id: number; type: string; title?: string; username?: string; first_name?: string };
    from?: { id: number; is_bot: boolean; first_name: string; username?: string };
  };
}

/** Telegram's response envelope. */
interface TelegramEnvelope<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

export interface SendMessageOptions {
  parseMode?: 'HTML';
  disableWebPagePreview?: boolean;
}

export interface GetUpdatesOptions {
  /** Long-poll duration in seconds; 0 (the default) returns immediately. */
  timeoutSec?: number;
  limit?: number;
}

/**
 * A failed Bot API call, classified for the outbox.
 *
 * `message` is safe to persist and log: it carries the method name, the
 * Telegram `error_code` and `description` — never the request URL, which
 * contains the bot token (`/bot<token>/<method>`).
 */
export class TelegramApiError extends Error {
  constructor(
    message: string,
    readonly kind: 'transient' | 'permanent',
    readonly method: string,
    /** Telegram `error_code` (or HTTP status); undefined for a network failure. */
    readonly errorCode?: number,
    /** Seconds Telegram asked us to wait (429 only). */
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'TelegramApiError';
  }
}

/**
 * TelegramClient — thin wrapper around the Telegram Bot API (TASK-674).
 *
 * Three methods, because that is all the notification channel needs:
 * {@link getMe} (is the token alive, and what is the bot called), {@link
 * sendMessage} (deliver a ping) and {@link getUpdates} (read `/start <token>`
 * for chat binding, TASK-675). No database, no state beyond the token.
 *
 * ## The token never leaves this class
 *
 * The Bot API puts the secret IN THE PATH (`/bot<token>/getMe`), so every
 * place a URL usually ends up — a fetch error message ("Failed to parse URL
 * from …"), a logged request, an exception that bubbles into `lastError` of an
 * outbox row and from there into the admin panel — is a leak. Hence: the URL
 * is built in one place and never logged, every error is re-thrown as a
 * {@link TelegramApiError} built from the method name and Telegram's own
 * `description`/`error_code`, and any text that could still contain the token
 * is passed through {@link redact} first.
 *
 * Mirrors `NovaPoshtaClient` / `UmamiClient`: native `fetch` with
 * `AbortSignal.timeout`, and `@Optional()` base URL + fetch so specs can drive
 * it through a real local HTTP server.
 */
@Injectable()
export class TelegramClient {
  private readonly token: string;
  private readonly apiUrl: string;

  constructor(
    config: ConfigService,
    private readonly logger: PinoLogger,
    @Optional() apiUrl: string = TELEGRAM_API_URL,
    @Optional() private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.logger.setContext(TelegramClient.name);
    this.token = (config.get<string>('TELEGRAM_BOT_TOKEN') ?? '').trim();
    // Trailing slashes are the classic source of `//bot…` 404s — which Telegram
    // answers exactly like a wrong token.
    this.apiUrl = apiUrl.replace(/\/+$/, '');
  }

  /** True when `TELEGRAM_BOT_TOKEN` is non-empty. Says nothing about whether it works. */
  isConfigured(): boolean {
    return this.token.length > 0;
  }

  /** Who the token belongs to. The cheapest call that proves the token is alive. */
  getMe(): Promise<TelegramBotUser> {
    return this.call<TelegramBotUser>('getMe', {});
  }

  /** Send a text message to `chatId` (a user, group or channel id, as a string). */
  sendMessage(
    chatId: string,
    text: string,
    opts: SendMessageOptions = {},
  ): Promise<TelegramMessage> {
    return this.call<TelegramMessage>('sendMessage', {
      chat_id: chatId,
      text,
      ...(opts.parseMode ? { parse_mode: opts.parseMode } : {}),
      ...(opts.disableWebPagePreview !== undefined
        ? { link_preview_options: { is_disabled: opts.disableWebPagePreview } }
        : {}),
    });
  }

  /**
   * Updates after `offset` (pass the last seen `update_id + 1`). Only `message`
   * updates are requested — the binding flow needs nothing else, and Telegram
   * then does not even queue the rest for us.
   */
  getUpdates(offset: number, opts: GetUpdatesOptions = {}): Promise<TelegramUpdate[]> {
    const timeoutSec = opts.timeoutSec ?? 0;
    return this.call<TelegramUpdate[]>(
      'getUpdates',
      {
        offset,
        timeout: timeoutSec,
        ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
        allowed_updates: ['message'],
      },
      // A long poll legitimately holds the socket for `timeoutSec`; the HTTP
      // timeout must outlast it or every idle poll would "fail".
      timeoutSec * 1000 + REQUEST_TIMEOUT_MS,
    );
  }

  /**
   * POST `body` to `method` and return `result`, or throw a classified
   * {@link TelegramApiError}. The only place the token-bearing URL exists.
   */
  private async call<T>(
    method: string,
    body: Record<string, unknown>,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    if (!this.isConfigured()) {
      throw new TelegramApiError(
        `Telegram ${method} not attempted: TELEGRAM_BOT_TOKEN is not set`,
        'permanent',
        method,
      );
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.apiUrl}/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      // NEVER log `err` itself: a URL-parse failure carries the whole URL, token
      // included, in its message.
      const reason = this.redact(describeNetworkError(err));
      this.logger.warn(
        { event: 'telegram.api.failed', method, kind: 'transient' },
        `Telegram ${method} request failed: ${reason}`,
      );
      throw new TelegramApiError(
        `Telegram ${method} request failed: ${reason}`,
        'transient',
        method,
      );
    }

    let envelope: TelegramEnvelope<T> | null = null;
    try {
      envelope = (await response.json()) as TelegramEnvelope<T>;
    } catch {
      // Not JSON (a proxy's HTML error page, an empty 502). Classified by status below.
    }

    if (response.ok && envelope?.ok === true) {
      return envelope.result as T;
    }

    const errorCode = envelope?.error_code ?? response.status;
    const description = this.redact(envelope?.description ?? `HTTP ${response.status}`);
    const retryAfterSec = envelope?.parameters?.retry_after;
    const kind = PERMANENT_CODES.has(errorCode) ? 'permanent' : 'transient';
    const message = `Telegram ${method} failed (${errorCode}): ${description}`;

    this.logger.warn(
      { event: 'telegram.api.failed', method, kind, errorCode, retryAfterSec },
      message,
    );
    throw new TelegramApiError(message, kind, method, errorCode, retryAfterSec);
  }

  /** Belt and braces: whatever text reaches a log or an error, the token is not in it. */
  private redact(text: string): string {
    return this.token ? text.split(this.token).join('<redacted>') : text;
  }
}

/** A short, URL-free description of a fetch failure: `TimeoutError`, `ECONNREFUSED`… */
function describeNetworkError(err: unknown): string {
  // Duck-typed, not `instanceof Error`: an abort reason is a DOMException, which
  // is not an `Error` of this realm under every runtime (Jest's VM included).
  if (typeof err !== 'object' || err === null) return 'unknown network error';
  const { name, cause } = err as { name?: unknown; cause?: { code?: unknown } };
  if (name === 'TimeoutError' || name === 'AbortError') return 'timed out';
  if (cause && typeof cause.code === 'string') return cause.code;
  return typeof name === 'string' ? name : 'unknown network error';
}
