import { Injectable, OnModuleInit } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { TelegramClient } from './telegram.client';

/**
 * What the Telegram channel can do right now (TASK-674).
 *
 * - `unconfigured` — `TELEGRAM_BOT_TOKEN` is not set. Not an error for dev/CI,
 *   but owner notifications are OFF and the log says so at error level;
 * - `failed` — a token is set, but the last `getMe` did not succeed (wrong or
 *   revoked token, Telegram unreachable). `reason` is Telegram's own words;
 * - `ok` — `getMe` answered; `botUsername` is what deep links point at.
 */
export type TelegramChannelSnapshot =
  | { state: 'unconfigured' }
  | { state: 'failed'; reason: string; checkedAt: Date }
  | { state: 'ok'; botUsername: string; checkedAt: Date };

/** How long a `failed` state is trusted before {@link TelegramChannelState.ensureFresh} asks again. */
export const TELEGRAM_RECHECK_AFTER_MS = 5 * 60 * 1000;

/**
 * TelegramChannelState — the single answer to "does the Telegram channel work?"
 * (TASK-674, plan 187 constraint #1: a channel that is not configured must SHOUT).
 *
 * On start-up it asks Telegram `getMe` and logs the outcome — `telegram.getMe.ok`
 * with the bot's name, `telegram.getMe.failed` with the reason, or
 * `telegram.notConfigured` when there is no token at all. Both failure lines are
 * `error` on purpose: the alternative is the fourth system in this project that
 * reports success it has not achieved (see prod-launch hardening, 2026-07-14).
 *
 * ## Start-up is never blocked, and never crashed
 *
 * `onModuleInit` STARTS the check and returns — Telegram being slow or down must
 * not hold the API's boot for the 10-second request timeout. The check itself
 * catches everything, so an unhandled rejection is impossible; until it settles
 * the channel reports `failed` ("not checked yet") and {@link isOk} is false, so
 * the outbox simply leaves Telegram rows for the next tick.
 *
 * ## A network blip at boot does not kill the channel until the next restart
 *
 * {@link ensureFresh} re-runs `getMe` when the state is `failed` and the last
 * check is at least {@link TELEGRAM_RECHECK_AFTER_MS} old. Concurrent callers
 * share one in-flight check, so a burst of admin page views or worker ticks
 * produces at most one request every five minutes.
 */
@Injectable()
export class TelegramChannelState implements OnModuleInit {
  private current: TelegramChannelSnapshot;
  private inFlight: Promise<TelegramChannelSnapshot> | null = null;

  constructor(
    private readonly client: TelegramClient,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TelegramChannelState.name);
    this.current = client.isConfigured()
      ? { state: 'failed', reason: 'getMe has not answered yet', checkedAt: new Date(0) }
      : { state: 'unconfigured' };
  }

  onModuleInit(): void {
    if (!this.client.isConfigured()) {
      this.logger.error(
        { event: 'telegram.notConfigured' },
        'TELEGRAM_BOT_TOKEN is not set — owner notifications are OFF. Create a bot in @BotFather and set the token to enable the Telegram channel.',
      );
      return;
    }
    // Deliberately not awaited — see the class docblock. `refresh` never rejects.
    void this.refresh();
  }

  /** The last known state, without any I/O. */
  snapshot(): TelegramChannelSnapshot {
    return this.current;
  }

  /** True only when the last `getMe` succeeded. Synchronous: safe on every dispatch. */
  isOk(): boolean {
    return this.current.state === 'ok';
  }

  /**
   * Settle the state: wait for a check already in flight, or re-check a `failed`
   * state that is at least five minutes old. `ok` and `unconfigured` are returned
   * as they are — a working token is not re-verified on a timer, and a missing one
   * cannot appear without a restart. Never rejects.
   */
  async ensureFresh(): Promise<TelegramChannelSnapshot> {
    if (this.inFlight) return this.inFlight;
    const state = this.current;
    if (
      state.state === 'failed' &&
      Date.now() - state.checkedAt.getTime() >= TELEGRAM_RECHECK_AFTER_MS
    ) {
      return this.refresh();
    }
    return state;
  }

  /**
   * Mark the channel failed from outside — the adapter calls this when Telegram
   * rejects the TOKEN mid-flight (401/404), so the outbox stops spending rows on
   * a bot that no longer exists until the next re-check.
   */
  markFailed(reason: string): void {
    if (!this.client.isConfigured()) return;
    this.current = { state: 'failed', reason, checkedAt: new Date(Date.now()) };
    this.logger.error(
      { event: 'telegram.channel.failed', reason },
      `Telegram channel failed: ${reason}`,
    );
  }

  /** Run `getMe` once (deduplicated) and record the outcome. Never rejects. */
  private refresh(): Promise<TelegramChannelSnapshot> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.check().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async check(): Promise<TelegramChannelSnapshot> {
    try {
      const me = await this.client.getMe();
      const botUsername = me.username ?? me.first_name;
      this.current = { state: 'ok', botUsername, checkedAt: new Date(Date.now()) };
      this.logger.info(
        { event: 'telegram.getMe.ok', botUsername },
        `Telegram channel ready as @${botUsername}`,
      );
    } catch (err) {
      // TelegramClient errors are token-free by construction; anything else is
      // reduced to its message, which never contains the URL either.
      const reason = err instanceof Error ? err.message : 'unknown error';
      this.current = { state: 'failed', reason, checkedAt: new Date(Date.now()) };
      this.logger.error(
        { event: 'telegram.getMe.failed', reason },
        `Telegram getMe failed — owner notifications are OFF until it succeeds: ${reason}`,
      );
    }
    return this.current;
  }
}
