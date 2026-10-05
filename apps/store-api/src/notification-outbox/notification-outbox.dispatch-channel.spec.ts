import { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { NotificationChannel, NotificationOutbox, NotificationOutboxStatus } from '@prisma/client';
import { NotificationOutboxService } from './notification-outbox.service';
import { NotificationOutboxRepository } from './notification-outbox.repository';
import type { Clock } from './notification-outbox.clock';
import { ORDER_CONFIRMATION_MAIL_TYPE } from './notification-outbox.types';
import {
  PermanentDeliveryError,
  type NotificationChannelAdapter,
} from './channels/notification-channel-adapter';

/**
 * Channel routing of {@link NotificationOutboxService.dispatchDue} (TASK-673).
 *
 * The mail-only behaviour is pinned by `notification-outbox.service.spec.ts`;
 * this spec pins what channels add: a row goes to the adapter of ITS channel, a
 * channel with no adapter is retried (not lost), a permanent failure is not
 * retried, and one channel's disabled transport never holds back another's.
 */

const NOW = new Date('2026-10-01T12:00:00.000Z');
const BASE_MS = 1000;

const makeRow = (overrides: Partial<NotificationOutbox> = {}): NotificationOutbox => ({
  id: 'row-1',
  type: ORDER_CONFIRMATION_MAIL_TYPE,
  channel: NotificationChannel.EMAIL,
  recipientAddress: 'buyer@example.com',
  payload: { to: 'buyer@example.com' },
  status: NotificationOutboxStatus.PENDING,
  attempts: 0,
  maxAttempts: 5,
  lastError: null,
  nextAttemptAt: NOW,
  createdAt: NOW,
  sentAt: null,
  ...overrides,
});

type FakeAdapter = NotificationChannelAdapter & {
  send: jest.Mock<Promise<void>, [NotificationOutbox]>;
  isEnabled: jest.Mock<boolean, []>;
};

function fakeAdapter(
  channel: NotificationChannel,
  enabled = true,
  configured = enabled,
): FakeAdapter {
  return {
    channel,
    isEnabled: jest.fn(() => enabled),
    isConfigured: jest.fn(() => configured),
    send: jest.fn<Promise<void>, [NotificationOutbox]>().mockResolvedValue(undefined),
    healthcheck: jest.fn().mockResolvedValue({ state: enabled ? 'ok' : 'disabled' }),
  };
}

const repositoryMock = {
  claimDue: jest.fn(),
  markSent: jest.fn(),
  markRetry: jest.fn(),
  markFailed: jest.fn(),
};

/** The due rows, as `claimDue` serves them: one channel per call. */
function givenDue(rows: NotificationOutbox[]): void {
  repositoryMock.claimDue.mockImplementation(
    (_now: Date, _limit: number, channel: NotificationChannel) =>
      Promise.resolve(rows.filter((row) => row.channel === channel)),
  );
}

const loggerMock = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  setContext: jest.fn(),
};

const clock: Clock = { now: () => NOW };

function buildService(
  adapters: NotificationChannelAdapter[],
  nodeEnv = 'test',
): NotificationOutboxService {
  const config = {
    get: jest.fn((key: string, def?: unknown) => {
      const values: Record<string, unknown> = {
        MAIL_OUTBOX_BACKOFF_BASE_MS: BASE_MS,
        MAIL_OUTBOX_BACKOFF_MAX_MS: 10_000,
        MAIL_OUTBOX_BATCH_SIZE: 25,
        NODE_ENV: nodeEnv,
      };
      return key in values ? values[key] : def;
    }),
  };
  return new NotificationOutboxService(
    repositoryMock as unknown as NotificationOutboxRepository,
    adapters,
    config as unknown as ConfigService,
    loggerMock as unknown as PinoLogger,
    clock,
  );
}

describe('NotificationOutboxService.dispatchDue — channels (TASK-673)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    repositoryMock.markSent.mockResolvedValue(undefined);
    repositoryMock.markRetry.mockResolvedValue(undefined);
    repositoryMock.markFailed.mockResolvedValue(undefined);
  });

  it('hands each row to the adapter of its own channel', async () => {
    const email = fakeAdapter(NotificationChannel.EMAIL);
    const telegram = fakeAdapter(NotificationChannel.TELEGRAM);
    const emailRow = makeRow({ id: 'e-1' });
    const telegramRow = makeRow({
      id: 't-1',
      channel: NotificationChannel.TELEGRAM,
      recipientAddress: '123456789',
    });
    givenDue([telegramRow, emailRow]);

    const result = await buildService([email, telegram]).dispatchDue();

    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send).toHaveBeenCalledWith(emailRow);
    expect(telegram.send).toHaveBeenCalledTimes(1);
    expect(telegram.send).toHaveBeenCalledWith(telegramRow);
    expect(repositoryMock.markSent).toHaveBeenCalledWith('e-1', NOW);
    expect(repositoryMock.markSent).toHaveBeenCalledWith('t-1', NOW);
    expect(result).toEqual({ sent: 2, retried: 0, failed: 0 });
  });

  describe('a channel with no registered adapter', () => {
    it('retries the row with backoff (not lost, not sent) and still delivers the other channel', async () => {
      const email = fakeAdapter(NotificationChannel.EMAIL);
      givenDue([
        makeRow({ id: 't-1', channel: NotificationChannel.TELEGRAM, attempts: 0 }),
        makeRow({ id: 'e-1' }),
      ]);

      const result = await buildService([email]).dispatchDue();

      expect(repositoryMock.markRetry).toHaveBeenCalledWith(
        't-1',
        'No adapter registered for notification channel: TELEGRAM',
        new Date(NOW.getTime() + BASE_MS),
        1,
      );
      expect(repositoryMock.markSent).toHaveBeenCalledTimes(1);
      expect(repositoryMock.markSent).toHaveBeenCalledWith('e-1', NOW);
      expect(email.send).toHaveBeenCalledTimes(1);
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'mailOutbox.dispatch.noAdapter',
          channel: NotificationChannel.TELEGRAM,
          count: 1,
        }),
        expect.any(String),
      );
      expect(result).toEqual({ sent: 1, retried: 1, failed: 0 });
    });

    it('marks the row FAILED once the attempts reach maxAttempts', async () => {
      givenDue([
        makeRow({ id: 't-1', channel: NotificationChannel.TELEGRAM, attempts: 4, maxAttempts: 5 }),
      ]);

      const result = await buildService([fakeAdapter(NotificationChannel.EMAIL)]).dispatchDue();

      expect(repositoryMock.markFailed).toHaveBeenCalledWith(
        't-1',
        'No adapter registered for notification channel: TELEGRAM',
        5,
      );
      expect(repositoryMock.markRetry).not.toHaveBeenCalled();
      expect(result).toEqual({ sent: 0, retried: 0, failed: 1 });
    });
  });

  it('marks the row FAILED at once on a PermanentDeliveryError (no retry, attempts + 1)', async () => {
    const telegram = fakeAdapter(NotificationChannel.TELEGRAM);
    telegram.send.mockRejectedValue(new PermanentDeliveryError('Forbidden: bot was blocked'));
    givenDue([
      makeRow({ id: 't-1', channel: NotificationChannel.TELEGRAM, attempts: 1, maxAttempts: 5 }),
    ]);

    const result = await buildService([telegram]).dispatchDue();

    expect(repositoryMock.markFailed).toHaveBeenCalledWith('t-1', 'Forbidden: bot was blocked', 2);
    expect(repositoryMock.markRetry).not.toHaveBeenCalled();
    expect(repositoryMock.markSent).not.toHaveBeenCalled();
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'mailOutbox.dispatch.failed', id: 't-1', permanent: true }),
      expect.any(String),
    );
    expect(result).toEqual({ sent: 0, retried: 0, failed: 1 });
  });

  it('in production a disabled EMAIL transport leaves EMAIL rows PENDING while an enabled TELEGRAM still sends', async () => {
    const email = fakeAdapter(NotificationChannel.EMAIL, false);
    const telegram = fakeAdapter(NotificationChannel.TELEGRAM, true);
    givenDue([
      makeRow({ id: 'e-1' }),
      makeRow({ id: 't-1', channel: NotificationChannel.TELEGRAM }),
      makeRow({ id: 'e-2' }),
    ]);

    const result = await buildService([email, telegram], 'production').dispatchDue();

    expect(email.send).not.toHaveBeenCalled();
    expect(telegram.send).toHaveBeenCalledTimes(1);
    expect(repositoryMock.markSent).toHaveBeenCalledTimes(1);
    expect(repositoryMock.markSent).toHaveBeenCalledWith('t-1', NOW);
    expect(repositoryMock.markRetry).not.toHaveBeenCalled();
    expect(repositoryMock.markFailed).not.toHaveBeenCalled();
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'mailOutbox.dispatch.blocked',
        channel: NotificationChannel.EMAIL,
        pending: 2,
      }),
      expect.stringContaining('MAIL_ENABLED is false in production'),
    );
    expect(result).toEqual({ sent: 1, retried: 0, failed: 0 });
  });

  it('outside production drains only the disabled channel as a no-op; the enabled one goes through its transport', async () => {
    const email = fakeAdapter(NotificationChannel.EMAIL, true);
    const telegram = fakeAdapter(NotificationChannel.TELEGRAM, false);
    givenDue([
      makeRow({ id: 't-1', channel: NotificationChannel.TELEGRAM }),
      makeRow({ id: 'e-1' }),
    ]);

    const result = await buildService([email, telegram]).dispatchDue();

    expect(telegram.send).not.toHaveBeenCalled();
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(repositoryMock.markSent).toHaveBeenCalledWith('t-1', NOW);
    expect(repositoryMock.markSent).toHaveBeenCalledWith('e-1', NOW);
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'mailOutbox.dispatch.drained',
        channel: NotificationChannel.TELEGRAM,
        count: 1,
      }),
      expect.any(String),
    );
    expect(result).toEqual({ sent: 2, retried: 0, failed: 0 });
  });

  // Plan 187 review, W1: a blocked channel's rows stay PENDING and due, so in a
  // shared oldest-first batch they would take every slot, tick after tick.
  it('claims each channel separately, so a full batch of blocked TELEGRAM rows does not starve EMAIL', async () => {
    const email = fakeAdapter(NotificationChannel.EMAIL);
    const telegram = fakeAdapter(NotificationChannel.TELEGRAM, false, true);
    const blocked = Array.from({ length: 25 }, (_, i) =>
      makeRow({
        id: `t-${i}`,
        channel: NotificationChannel.TELEGRAM,
        nextAttemptAt: new Date(NOW.getTime() - 60_000),
      }),
    );
    givenDue([...blocked, makeRow({ id: 'e-1' })]);

    const result = await buildService([email, telegram], 'production').dispatchDue();

    expect(repositoryMock.claimDue).toHaveBeenCalledWith(NOW, 25, NotificationChannel.EMAIL);
    expect(repositoryMock.claimDue).toHaveBeenCalledWith(NOW, 25, NotificationChannel.TELEGRAM);
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(repositoryMock.markSent).toHaveBeenCalledTimes(1);
    expect(repositoryMock.markSent).toHaveBeenCalledWith('e-1', NOW);
    expect(result).toEqual({ sent: 1, retried: 0, failed: 0 });
  });

  // Plan 187 review, W2: a token is set, but `getMe` has not answered yet (or
  // failed). These are real messages — the no-op drain would report them sent.
  it('outside production keeps a configured-but-unavailable channel PENDING instead of draining it', async () => {
    const email = fakeAdapter(NotificationChannel.EMAIL);
    const telegram = fakeAdapter(NotificationChannel.TELEGRAM, false, true);
    givenDue([
      makeRow({ id: 't-1', channel: NotificationChannel.TELEGRAM }),
      makeRow({ id: 'e-1' }),
    ]);

    const result = await buildService([email, telegram]).dispatchDue();

    expect(telegram.send).not.toHaveBeenCalled();
    expect(repositoryMock.markSent).toHaveBeenCalledTimes(1);
    expect(repositoryMock.markSent).toHaveBeenCalledWith('e-1', NOW);
    expect(repositoryMock.markRetry).not.toHaveBeenCalled();
    expect(repositoryMock.markFailed).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'mailOutbox.dispatch.blocked',
        channel: NotificationChannel.TELEGRAM,
        pending: 1,
      }),
      expect.any(String),
    );
    expect(result).toEqual({ sent: 1, retried: 0, failed: 0 });
  });

  it('refuses two adapters for the same channel', () => {
    expect(() =>
      buildService([
        fakeAdapter(NotificationChannel.EMAIL),
        fakeAdapter(NotificationChannel.EMAIL),
      ]),
    ).toThrow('Duplicate notification channel adapter: EMAIL');
  });
});
