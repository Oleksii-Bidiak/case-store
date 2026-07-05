import { ConfigService } from '@nestjs/config';
import { DiscoveryService } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { PinoLogger } from 'nestjs-pino';
import { PublishingScheduler } from './publishing.scheduler';
import { PUBLISHABLE_REPOSITORY, type PublishablePort } from './publishing.tokens';
import type { RevalidationNotifier } from './revalidation.notifier';

const schedulerRegistryMock = { addCronJob: jest.fn() };

const loggerMock = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  setContext: jest.fn(),
};

const revalidationMock = { revalidate: jest.fn() };

/** Build a fake DiscoveryService whose getProviders() yields the given ports as
 *  wrappers registered under PUBLISHABLE_REPOSITORY (plus some noise). */
function discoveryWith(...ports: PublishablePort[]): DiscoveryService {
  const wrappers = [
    { token: Symbol('noise'), instance: { foo: 1 } },
    ...ports.map((instance) => ({ token: PUBLISHABLE_REPOSITORY, instance })),
    { token: PUBLISHABLE_REPOSITORY, instance: null }, // uninstantiated → skipped
  ];
  return { getProviders: jest.fn(() => wrappers) } as unknown as DiscoveryService;
}

function buildScheduler(discovery: DiscoveryService, cron = '* * * * *'): PublishingScheduler {
  const configMock = {
    get: jest.fn((key: string, def?: unknown) => (key === 'PUBLISHING_CRON' ? cron : def)),
  };
  return new PublishingScheduler(
    configMock as unknown as ConfigService,
    schedulerRegistryMock as unknown as SchedulerRegistry,
    discovery,
    loggerMock as unknown as PinoLogger,
    revalidationMock as unknown as RevalidationNotifier,
  );
}

describe('PublishingScheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    revalidationMock.revalidate.mockResolvedValue(undefined);
  });

  describe('onModuleInit', () => {
    it('registers and starts a cron job using the configured expression', () => {
      const scheduler = buildScheduler(discoveryWith(), '*/2 * * * *');

      scheduler.onModuleInit();

      expect(schedulerRegistryMock.addCronJob).toHaveBeenCalledWith(
        'publishing-publish-due',
        expect.anything(),
      );
      const job = schedulerRegistryMock.addCronJob.mock.calls[0][1];
      expect(job.cronTime.source).toBe('*/2 * * * *');
      job.stop();
    });
  });

  describe('tick', () => {
    it('flips due rows on every discovered publisher', async () => {
      const a: PublishablePort = { publishDue: jest.fn().mockResolvedValue(0) };
      const b: PublishablePort = { publishDue: jest.fn().mockResolvedValue(0) };
      const scheduler = buildScheduler(discoveryWith(a, b));

      await scheduler.tick();

      expect(a.publishDue).toHaveBeenCalledTimes(1);
      expect(b.publishDue).toHaveBeenCalledTimes(1);
    });

    it('revalidates a publisher target only when it flipped ≥1 row', async () => {
      const changed: PublishablePort = {
        publishDue: jest.fn().mockResolvedValue(2),
        revalidateTarget: { tags: ['pages'], paths: ['/legal'] },
      };
      const unchanged: PublishablePort = {
        publishDue: jest.fn().mockResolvedValue(0),
        revalidateTarget: { tags: ['blog'] },
      };
      const scheduler = buildScheduler(discoveryWith(changed, unchanged));

      await scheduler.tick();

      expect(revalidationMock.revalidate).toHaveBeenCalledTimes(1);
      expect(revalidationMock.revalidate).toHaveBeenCalledWith({
        tags: ['pages'],
        paths: ['/legal'],
      });
    });

    it('does not revalidate when a changed publisher has no target', async () => {
      const changed: PublishablePort = { publishDue: jest.fn().mockResolvedValue(3) };
      const scheduler = buildScheduler(discoveryWith(changed));

      await scheduler.tick();

      expect(revalidationMock.revalidate).not.toHaveBeenCalled();
    });

    it('swallows and logs a publisher error, still running the others', async () => {
      const bad: PublishablePort = {
        publishDue: jest.fn().mockRejectedValue(new Error('db down')),
      };
      const good: PublishablePort = { publishDue: jest.fn().mockResolvedValue(0) };
      const scheduler = buildScheduler(discoveryWith(bad, good));

      await expect(scheduler.tick()).resolves.toBeUndefined();
      expect(good.publishDue).toHaveBeenCalledTimes(1);
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'publishing.publishDue.error' }),
        expect.any(String),
      );
    });
  });
});
