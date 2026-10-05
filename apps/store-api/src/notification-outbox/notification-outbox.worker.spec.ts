import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { PinoLogger } from 'nestjs-pino';
import { NotificationOutboxWorker } from './notification-outbox.worker';
import { NotificationOutboxService } from './notification-outbox.service';

const outboxServiceMock = {
  dispatchDue: jest.fn(),
};

const schedulerRegistryMock = {
  addCronJob: jest.fn(),
};

const loggerMock = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  setContext: jest.fn(),
};

function buildWorker(cron = '* * * * *'): NotificationOutboxWorker {
  const configMock = {
    get: jest.fn((key: string, def?: unknown) => (key === 'MAIL_OUTBOX_CRON' ? cron : def)),
  };
  return new NotificationOutboxWorker(
    outboxServiceMock as unknown as NotificationOutboxService,
    configMock as unknown as ConfigService,
    schedulerRegistryMock as unknown as SchedulerRegistry,
    loggerMock as unknown as PinoLogger,
  );
}

describe('NotificationOutboxWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    outboxServiceMock.dispatchDue.mockResolvedValue({ sent: 0, retried: 0, failed: 0 });
  });

  describe('onModuleInit', () => {
    it('registers and starts a cron job using the configured expression', () => {
      const worker = buildWorker('*/5 * * * *');

      worker.onModuleInit();

      expect(schedulerRegistryMock.addCronJob).toHaveBeenCalledWith(
        'mail-outbox-dispatch',
        expect.anything(),
      );
      const job = schedulerRegistryMock.addCronJob.mock.calls[0][1];
      expect(job.cronTime.source).toBe('*/5 * * * *');
      job.stop(); // stop the real timer so it does not leak between tests
    });
  });

  describe('tick', () => {
    it('delegates to NotificationOutboxService.dispatchDue', async () => {
      const worker = buildWorker();

      await worker.tick();

      expect(outboxServiceMock.dispatchDue).toHaveBeenCalledTimes(1);
    });

    it('swallows and logs a dispatch error instead of throwing', async () => {
      outboxServiceMock.dispatchDue.mockRejectedValue(new Error('db down'));
      const worker = buildWorker();

      await expect(worker.tick()).resolves.toBeUndefined();
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'mailOutbox.dispatch.error' }),
        expect.any(String),
      );
    });
  });
});
