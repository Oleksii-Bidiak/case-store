import type { PinoLogger } from 'nestjs-pino';
import { TelegramChannelState, TELEGRAM_RECHECK_AFTER_MS } from './telegram-channel.state';
import { TelegramApiError, type TelegramClient } from './telegram.client';

/**
 * Plan 187 constraint #1, pinned: a Telegram channel that does not work says so
 * — at error level, with a stable event name an operator can grep for — and the
 * API boots regardless.
 */

const T0 = new Date('2026-10-01T12:00:00.000Z').getTime();

function makeLogger(): jest.Mocked<PinoLogger> {
  return {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    setContext: jest.fn(),
  } as unknown as jest.Mocked<PinoLogger>;
}

function makeClient(configured: boolean) {
  return {
    isConfigured: jest.fn(() => configured),
    getMe: jest.fn(),
  };
}

type ClientMock = ReturnType<typeof makeClient>;

const build = (client: ClientMock, logger: jest.Mocked<PinoLogger>) =>
  new TelegramChannelState(client as unknown as TelegramClient, logger);

/** Let a fire-and-forget check started by onModuleInit settle. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('TelegramChannelState', () => {
  let now: number;
  let logger: jest.Mocked<PinoLogger>;

  beforeEach(() => {
    now = T0;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    logger = makeLogger();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('without a token', () => {
    it('is unconfigured, logs telegram.notConfigured at error level, and never calls Telegram', async () => {
      const client = makeClient(false);
      const state = build(client, logger);

      expect(() => state.onModuleInit()).not.toThrow();
      await settle();

      expect(state.snapshot()).toEqual({ state: 'unconfigured' });
      expect(state.isOk()).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        { event: 'telegram.notConfigured' },
        expect.stringContaining('TELEGRAM_BOT_TOKEN is not set'),
      );
      expect(client.getMe).not.toHaveBeenCalled();
    });

    it('stays unconfigured on ensureFresh — there is nothing to re-check', async () => {
      const client = makeClient(false);
      const state = build(client, logger);
      state.onModuleInit();
      now += TELEGRAM_RECHECK_AFTER_MS * 10;

      await expect(state.ensureFresh()).resolves.toEqual({ state: 'unconfigured' });
      expect(client.getMe).not.toHaveBeenCalled();
    });
  });

  describe('with a token', () => {
    it('getMe succeeds → ok with the bot username, logged as telegram.getMe.ok', async () => {
      const client = makeClient(true);
      client.getMe.mockResolvedValue({
        id: 1,
        is_bot: true,
        first_name: 'Shop',
        username: 'shop_bot',
      });
      const state = build(client, logger);

      state.onModuleInit();
      await settle();

      expect(state.snapshot()).toEqual({
        state: 'ok',
        botUsername: 'shop_bot',
        checkedAt: new Date(T0),
      });
      expect(state.isOk()).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        { event: 'telegram.getMe.ok', botUsername: 'shop_bot' },
        expect.stringContaining('@shop_bot'),
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('getMe fails → failed with Telegram’s reason, logged as telegram.getMe.failed', async () => {
      const client = makeClient(true);
      client.getMe.mockRejectedValue(
        new TelegramApiError(
          'Telegram getMe failed (401): Unauthorized',
          'permanent',
          'getMe',
          401,
        ),
      );
      const state = build(client, logger);

      state.onModuleInit();
      await settle();

      expect(state.snapshot()).toEqual({
        state: 'failed',
        reason: 'Telegram getMe failed (401): Unauthorized',
        checkedAt: new Date(T0),
      });
      expect(state.isOk()).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        { event: 'telegram.getMe.failed', reason: 'Telegram getMe failed (401): Unauthorized' },
        expect.any(String),
      );
    });

    it('does not block start-up: onModuleInit returns before getMe answers', () => {
      const client = makeClient(true);
      client.getMe.mockReturnValue(new Promise(() => undefined)); // never settles
      const state = build(client, logger);

      expect(state.onModuleInit()).toBeUndefined();
      expect(client.getMe).toHaveBeenCalledTimes(1);
      expect(state.isOk()).toBe(false);
    });

    it('ensureFresh waits for the start-up check instead of starting a second one', async () => {
      const client = makeClient(true);
      let answer!: (v: unknown) => void;
      client.getMe.mockReturnValue(new Promise((resolve) => (answer = resolve)));
      const state = build(client, logger);
      state.onModuleInit();

      const pending = state.ensureFresh();
      answer({ id: 1, is_bot: true, first_name: 'Shop', username: 'shop_bot' });

      await expect(pending).resolves.toMatchObject({ state: 'ok', botUsername: 'shop_bot' });
      expect(client.getMe).toHaveBeenCalledTimes(1);
    });
  });

  describe('ensureFresh after a failure', () => {
    async function failedAtT0() {
      const client = makeClient(true);
      client.getMe.mockRejectedValueOnce(
        new TelegramApiError('Telegram getMe request failed: ECONNRESET', 'transient', 'getMe'),
      );
      const state = build(client, logger);
      state.onModuleInit();
      await settle();
      expect(state.snapshot().state).toBe('failed');
      return { client, state };
    }

    it('does not re-check inside the five-minute window', async () => {
      const { client, state } = await failedAtT0();
      now = T0 + TELEGRAM_RECHECK_AFTER_MS - 1;

      await expect(state.ensureFresh()).resolves.toMatchObject({ state: 'failed' });
      expect(client.getMe).toHaveBeenCalledTimes(1);
    });

    it('re-checks once the window has passed, and recovers to ok', async () => {
      const { client, state } = await failedAtT0();
      client.getMe.mockResolvedValue({
        id: 1,
        is_bot: true,
        first_name: 'Shop',
        username: 'shop_bot',
      });
      now = T0 + TELEGRAM_RECHECK_AFTER_MS;

      await expect(state.ensureFresh()).resolves.toMatchObject({
        state: 'ok',
        botUsername: 'shop_bot',
      });
      expect(client.getMe).toHaveBeenCalledTimes(2);
      expect(state.isOk()).toBe(true);
    });

    it('concurrent callers share ONE re-check', async () => {
      const { client, state } = await failedAtT0();
      client.getMe.mockResolvedValue({
        id: 1,
        is_bot: true,
        first_name: 'Shop',
        username: 'shop_bot',
      });
      now = T0 + TELEGRAM_RECHECK_AFTER_MS;

      await Promise.all([state.ensureFresh(), state.ensureFresh(), state.ensureFresh()]);

      expect(client.getMe).toHaveBeenCalledTimes(2); // start-up + exactly one re-check
    });

    it('a failed re-check restarts the window', async () => {
      const { client, state } = await failedAtT0();
      client.getMe.mockRejectedValue(new Error('still down'));
      now = T0 + TELEGRAM_RECHECK_AFTER_MS;
      await state.ensureFresh();

      now += TELEGRAM_RECHECK_AFTER_MS - 1;
      await expect(state.ensureFresh()).resolves.toMatchObject({
        state: 'failed',
        reason: 'still down',
      });
      expect(client.getMe).toHaveBeenCalledTimes(2);
    });

    it('an ok state is not re-verified on a timer', async () => {
      const client = makeClient(true);
      client.getMe.mockResolvedValue({
        id: 1,
        is_bot: true,
        first_name: 'Shop',
        username: 'shop_bot',
      });
      const state = build(client, logger);
      state.onModuleInit();
      await settle();
      now += TELEGRAM_RECHECK_AFTER_MS * 100;

      await state.ensureFresh();

      expect(client.getMe).toHaveBeenCalledTimes(1);
    });
  });

  it('markFailed takes a working channel down until the next re-check', async () => {
    const client = makeClient(true);
    client.getMe.mockResolvedValue({
      id: 1,
      is_bot: true,
      first_name: 'Shop',
      username: 'shop_bot',
    });
    const state = build(client, logger);
    state.onModuleInit();
    await settle();

    state.markFailed('Telegram sendMessage failed (401): Unauthorized');

    expect(state.isOk()).toBe(false);
    expect(state.snapshot()).toMatchObject({
      state: 'failed',
      reason: expect.stringContaining('401'),
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'telegram.channel.failed' }),
      expect.any(String),
    );
  });
});
