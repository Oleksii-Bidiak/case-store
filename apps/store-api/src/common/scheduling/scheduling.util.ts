import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';

/**
 * Whether this process should run background cron jobs at all.
 *
 * Defaults to ON — only the literal string `false` disables it, so a typo or an
 * unset variable can never silently stop the outbox, the payment reconciler or
 * scheduled publishing in production.
 *
 * ## Why it exists (TASK-381)
 *
 * The e2e suite builds a real application per spec and replaces `PrismaService`
 * with a mock. Workers, however, are real, and they tick on a schedule — the
 * catalogue import every ten seconds. So a timer fires mid-test, calls into a
 * Prisma mock that has no `catalogImportRun`, and throws
 * `Cannot read properties of undefined (reading 'findFirst')` INSIDE whichever
 * test happened to be running. A random unrelated suite fails and the next run
 * is green: the flake that CI would have blamed on whatever PR was open.
 *
 * Background work on a schedule is not what those tests are testing — every
 * worker exposes its `tick()` publicly so it can be driven directly — so the
 * harness turns scheduling off in `test/setup-e2e.ts` and the behaviour under
 * test stays exactly the same.
 *
 * Useful in production too: a second API container can be brought up with
 * `SCHEDULER_ENABLED=false` so only one process drains the queues.
 */
export function schedulingEnabled(config: ConfigService): boolean {
  return config.get<string>('SCHEDULER_ENABLED') !== 'false';
}

/**
 * Stop and unregister a cron job that was added through {@link SchedulerRegistry}
 * manually, i.e. with `addCronJob()` + `job.start()` rather than with the `@Cron`
 * decorator.
 *
 * ## Why this has to be done by hand (TASK-381)
 *
 * `ScheduleModule`'s orchestrator implements `onApplicationShutdown` and closes
 * the jobs IT created — the ones it discovered from `@Cron` decorators. Jobs
 * pushed into the registry by application code are not in that collection, so
 * `app.close()` leaves them running: the Nest context is torn down, providers
 * are destroyed, Prisma disconnects, and the timer keeps firing into the wreck.
 *
 * Every worker in this project registers its job this way on purpose — the
 * schedule comes from config at boot, which a decorator cannot do — so every one
 * of them leaked.
 *
 * What that leak looks like:
 *
 * - **In tests:** each e2e spec builds and closes its own app. The escaped timer
 *   from a previous spec fires mid-run and throws
 *   `Cannot read properties of undefined (reading 'findFirst')` — a disconnected
 *   Prisma client — and the error surfaces inside whichever test happens to be
 *   executing. A random, unrelated suite fails, and the next run is green. The
 *   catalogue-import worker caught it first simply because it ticks every 10
 *   seconds instead of every minute.
 * - **In production:** during a rolling restart the outgoing container keeps
 *   ticking after it was asked to stop, so two processes briefly work the same
 *   queue.
 *
 * Safe to call when the job was never registered (the module was destroyed
 * before `onModuleInit` completed): the registry throws on an unknown name, and
 * that is nothing a shutdown path should propagate.
 */
export function stopCronJob(schedulerRegistry: SchedulerRegistry, name: string): void {
  try {
    schedulerRegistry.deleteCronJob(name);
  } catch {
    // Not registered — nothing to stop.
  }
}
