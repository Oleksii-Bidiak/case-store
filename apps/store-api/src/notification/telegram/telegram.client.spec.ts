import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { TelegramApiError, TelegramClient } from './telegram.client';

/**
 * Driven through a REAL local HTTP server, like `nova-poshta.client.spec.ts`: a
 * stubbed `fetch` would assert our mock's idea of the wire format, a socket
 * asserts the client's — the token-bearing path, the JSON body, the envelope
 * parsing and, above all, that the token never escapes into an error or a log.
 */

const TOKEN = '123456789:AAFakeTokenThatMustNeverBeLogged_x9';

interface Captured {
  path: string;
  body: Record<string, unknown>;
}

type Responder = (req: Captured) => { status?: number; body: unknown; delayMs?: number };

class MockTelegramServer {
  private server!: Server;
  private readonly timers = new Set<NodeJS.Timeout>();
  readonly requests: Captured[] = [];
  respond: Responder = () => ({ body: { ok: true, result: true } });

  async start(): Promise<string> {
    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const captured = {
          path: req.url ?? '',
          body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {},
        };
        this.requests.push(captured);
        const { status = 200, body, delayMs = 0 } = this.respond(captured);
        const timer = setTimeout(() => {
          this.timers.delete(timer);
          if (res.destroyed) return;
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(typeof body === 'string' ? body : JSON.stringify(body));
        }, delayMs);
        this.timers.add(timer);
      });
    });
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  async stop(): Promise<void> {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      this.server.close((err) => (err ? reject(err) : resolve())),
    );
  }

  get only(): Captured {
    expect(this.requests).toHaveLength(1);
    return this.requests[0];
  }
}

function makeConfig(values: Record<string, unknown>): ConfigService {
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

function makeLogger(): jest.Mocked<PinoLogger> {
  return {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    setContext: jest.fn(),
  } as unknown as jest.Mocked<PinoLogger>;
}

/** Everything the logger was ever called with, flattened to one string. */
function loggedText(logger: jest.Mocked<PinoLogger>): string {
  return JSON.stringify([
    logger.info.mock.calls,
    logger.warn.mock.calls,
    logger.error.mock.calls,
    logger.debug.mock.calls,
  ]);
}

async function caught(promise: Promise<unknown>): Promise<TelegramApiError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(TelegramApiError);
    return err as TelegramApiError;
  }
  throw new Error('expected the call to reject');
}

describe('TelegramClient', () => {
  let tg: MockTelegramServer;
  let baseUrl: string;
  let logger: jest.Mocked<PinoLogger>;

  beforeEach(async () => {
    tg = new MockTelegramServer();
    baseUrl = await tg.start();
    logger = makeLogger();
  });

  afterEach(async () => {
    await tg.stop();
  });

  const makeClient = (token: string | null = TOKEN, url = baseUrl) =>
    new TelegramClient(makeConfig({ TELEGRAM_BOT_TOKEN: token ?? undefined }), logger, url);

  describe('isConfigured', () => {
    it.each([
      [null, false],
      ['', false],
      ['   ', false],
      [TOKEN, true],
    ])('token %p → %p', (token, expected) => {
      expect(makeClient(token).isConfigured()).toBe(expected);
    });

    it('does not touch the network without a token, and says so without a URL', async () => {
      const err = await caught(makeClient('').getMe());
      expect(err.kind).toBe('permanent');
      expect(err.message).toMatch(/TELEGRAM_BOT_TOKEN is not set/);
      expect(tg.requests).toHaveLength(0);
    });
  });

  describe('successful envelopes', () => {
    it('getMe POSTs to /bot<token>/getMe and returns `result`', async () => {
      tg.respond = () => ({
        body: {
          ok: true,
          result: { id: 1, is_bot: true, first_name: 'Shop', username: 'shop_bot' },
        },
      });

      await expect(makeClient().getMe()).resolves.toMatchObject({ username: 'shop_bot' });
      expect(tg.only.path).toBe(`/bot${TOKEN}/getMe`);
    });

    it('sendMessage sends chat_id, text, HTML parse mode and disabled link previews', async () => {
      tg.respond = () => ({
        body: { ok: true, result: { message_id: 7, date: 1, chat: { id: -100, type: 'group' } } },
      });

      const msg = await makeClient().sendMessage('-100123', '<b>Нове</b> замовлення', {
        parseMode: 'HTML',
        disableWebPagePreview: true,
      });

      expect(msg.message_id).toBe(7);
      expect(tg.only.path).toBe(`/bot${TOKEN}/sendMessage`);
      expect(tg.only.body).toEqual({
        chat_id: '-100123',
        text: '<b>Нове</b> замовлення',
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
    });

    it('sendMessage without options sends neither parse_mode nor preview options', async () => {
      tg.respond = () => ({
        body: { ok: true, result: { message_id: 1, date: 1, chat: { id: 1, type: 'private' } } },
      });

      await makeClient().sendMessage('42', 'plain');

      expect(tg.only.body).toEqual({ chat_id: '42', text: 'plain' });
    });

    it('getUpdates asks only for message updates from the given offset', async () => {
      const updates = [
        {
          update_id: 10,
          message: { message_id: 1, date: 1, text: '/start abc', chat: { id: 5, type: 'private' } },
        },
      ];
      tg.respond = () => ({ body: { ok: true, result: updates } });

      await expect(makeClient().getUpdates(10, { timeoutSec: 0, limit: 50 })).resolves.toEqual(
        updates,
      );
      expect(tg.only.path).toBe(`/bot${TOKEN}/getUpdates`);
      expect(tg.only.body).toEqual({
        offset: 10,
        timeout: 0,
        limit: 50,
        allowed_updates: ['message'],
      });
    });

    it('tolerates a trailing slash on the base URL', async () => {
      tg.respond = () => ({ body: { ok: true, result: { id: 1, is_bot: true, first_name: 'x' } } });

      await makeClient(TOKEN, `${baseUrl}/`).getMe();

      expect(tg.only.path).toBe(`/bot${TOKEN}/getMe`);
    });
  });

  describe('error classification', () => {
    it.each([
      [400, 'Bad Request: chat not found'],
      [403, 'Forbidden: bot was blocked by the user'],
      [401, 'Unauthorized'],
      [404, 'Not Found'],
    ])('%i → permanent, with Telegram’s description and code', async (code, description) => {
      tg.respond = () => ({ status: code, body: { ok: false, error_code: code, description } });

      const err = await caught(makeClient().sendMessage('1', 'x'));

      expect(err.kind).toBe('permanent');
      expect(err.errorCode).toBe(code);
      expect(err.method).toBe('sendMessage');
      expect(err.message).toBe(`Telegram sendMessage failed (${code}): ${description}`);
    });

    it('429 → transient, carrying retry_after', async () => {
      tg.respond = () => ({
        status: 429,
        body: {
          ok: false,
          error_code: 429,
          description: 'Too Many Requests: retry after 7',
          parameters: { retry_after: 7 },
        },
      });

      const err = await caught(makeClient().sendMessage('1', 'x'));

      expect(err.kind).toBe('transient');
      expect(err.errorCode).toBe(429);
      expect(err.retryAfterSec).toBe(7);
    });

    it('500 → transient', async () => {
      tg.respond = () => ({
        status: 500,
        body: { ok: false, error_code: 500, description: 'Internal Server Error' },
      });

      const err = await caught(makeClient().getMe());

      expect(err.kind).toBe('transient');
      expect(err.errorCode).toBe(500);
    });

    it('a non-JSON 502 from a proxy → transient, described by its status', async () => {
      tg.respond = () => ({ status: 502, body: '<html>Bad Gateway</html>' });

      const err = await caught(makeClient().getMe());

      expect(err.kind).toBe('transient');
      expect(err.errorCode).toBe(502);
      expect(err.message).toBe('Telegram getMe failed (502): HTTP 502');
    });

    it('connection refused → transient, with no error code', async () => {
      await tg.stop();
      tg = new MockTelegramServer(); // afterEach needs something to stop
      const deadUrl = baseUrl;
      baseUrl = await tg.start();

      const err = await caught(makeClient(TOKEN, deadUrl).getMe());

      expect(err.kind).toBe('transient');
      expect(err.errorCode).toBeUndefined();
      expect(err.message).toMatch(/^Telegram getMe request failed: /);
    });

    it('a hung server → transient timeout', async () => {
      jest.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(new DOMException('timed out', 'TimeoutError')), 50);
        return controller.signal;
      });
      tg.respond = () => ({ body: { ok: true, result: {} }, delayMs: 2_000 });

      try {
        const err = await caught(makeClient().getMe());
        expect(err.kind).toBe('transient');
        expect(err.message).toBe('Telegram getMe request failed: timed out');
      } finally {
        jest.restoreAllMocks();
      }
    });
  });

  describe('the token never escapes', () => {
    it.each<[string, Responder | 'refused']>([
      [
        'a 401',
        () => ({ status: 401, body: { ok: false, error_code: 401, description: 'Unauthorized' } }),
      ],
      [
        'a 429',
        () => ({
          status: 429,
          body: {
            ok: false,
            error_code: 429,
            description: 'Too Many Requests',
            parameters: { retry_after: 1 },
          },
        }),
      ],
      ['a 500 without JSON', () => ({ status: 500, body: 'oops' })],
      // A hostile/buggy upstream echoing the path back must not smuggle it out either.
      [
        'a description that echoes the URL',
        (req) => ({
          status: 400,
          body: { ok: false, error_code: 400, description: `bad path ${req.path}` },
        }),
      ],
      ['a refused connection', 'refused'],
    ])('not in the thrown error nor in any log line for %s', async (_label, responder) => {
      let url = baseUrl;
      if (responder === 'refused') {
        await tg.stop();
        url = baseUrl;
        tg = new MockTelegramServer();
        baseUrl = await tg.start();
      } else {
        tg.respond = responder;
      }

      const err = await caught(makeClient(TOKEN, url).sendMessage('1', 'x'));

      expect(err.message).not.toContain(TOKEN);
      expect(String(err.stack)).not.toContain(TOKEN);
      expect(JSON.stringify(err)).not.toContain(TOKEN);
      expect(loggedText(logger)).not.toContain(TOKEN);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'telegram.api.failed', method: 'sendMessage' }),
        expect.any(String),
      );
    });

    it('not even when the URL itself is unparsable (fetch puts the URL in that message)', async () => {
      const err = await caught(makeClient(TOKEN, 'http://exa mple.invalid').getMe());

      expect(err.kind).toBe('transient');
      expect(err.message).not.toContain(TOKEN);
      expect(loggedText(logger)).not.toContain(TOKEN);
    });
  });
});
