import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { schedulingEnabled, stopCronJob } from './scheduling.util';

function makeConfig(value?: string): ConfigService {
  return { get: () => value } as unknown as ConfigService;
}

describe('schedulingEnabled (TASK-381)', () => {
  it.each([
    ['unset', undefined],
    ['true', 'true'],
    ['empty string', ''],
    ['a typo', 'flase'],
    ['uppercase FALSE', 'FALSE'],
  ])('is enabled when the value is %s', (_label, value) => {
    // Only the exact lowercase 'false' disables it: a typo must never silently
    // stop the mail outbox or the payment reconciler in production.
    expect(schedulingEnabled(makeConfig(value))).toBe(true);
  });

  it('is disabled only by the exact string "false"', () => {
    expect(schedulingEnabled(makeConfig('false'))).toBe(false);
  });
});

describe('stopCronJob (TASK-381)', () => {
  let registry: SchedulerRegistry;

  beforeEach(() => {
    registry = new SchedulerRegistry();
  });

  it('stops a running job and removes it from the registry', () => {
    const job = new CronJob('* * * * * *', () => undefined);
    registry.addCronJob('some-job', job);
    job.start();
    expect(job.running).toBe(true);

    stopCronJob(registry, 'some-job');

    // Both halves matter: a stopped job still in the registry blocks
    // re-registration under the same name on the next boot.
    expect(job.running).toBe(false);
    expect(registry.getCronJobs().has('some-job')).toBe(false);
  });

  it('is a no-op for a name that was never registered', () => {
    // Happens when a module is torn down before onModuleInit finished — a
    // shutdown path must not throw over it.
    expect(() => stopCronJob(registry, 'never-registered')).not.toThrow();
  });

  it('leaves other jobs alone', () => {
    const kept = new CronJob('* * * * * *', () => undefined);
    const dropped = new CronJob('* * * * * *', () => undefined);
    registry.addCronJob('kept', kept);
    registry.addCronJob('dropped', dropped);
    kept.start();
    dropped.start();

    stopCronJob(registry, 'dropped');

    expect(kept.running).toBe(true);
    expect(registry.getCronJobs().has('kept')).toBe(true);
    kept.stop();
  });
});
