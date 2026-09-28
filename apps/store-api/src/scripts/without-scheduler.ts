import type { AppModule } from '../app.module';

/**
 * Load `AppModule` for a one-off script with every cron worker switched off
 * (TASK-1027).
 *
 * A script that boots the application runs NEXT TO the live API, so it must not
 * drain the mail outbox, reconcile payments or publish scheduled content as well.
 * Setting `SCHEDULER_ENABLED=false` does that — but only if it happens BEFORE
 * `app.module` is first loaded: `ConfigModule.forRoot` snapshots the validated
 * environment at that moment, and `ConfigService.get` reads the snapshot before
 * `process.env`. The production container is started with
 * `SCHEDULER_ENABLED=true`, so with a static `import { AppModule }` the snapshot
 * says `true` and an assignment in `main()` comes too late — which is exactly
 * how `search-reindex.js` ran a second set of workers on the demo stand.
 *
 * Hence the module is required here, after the assignment, and must not be
 * imported statically anywhere in the script (a type-only import is fine).
 */
export function loadAppModuleWithoutScheduler(): typeof AppModule {
  process.env.SCHEDULER_ENABLED = 'false';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const loaded = require('../app.module') as typeof import('../app.module');
  return loaded.AppModule;
}
