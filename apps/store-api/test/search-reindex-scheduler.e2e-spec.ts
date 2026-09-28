/**
 * `search-reindex.js` must not start a second set of cron workers (TASK-1027).
 *
 * The script boots its own copy of the application next to the live API, so it
 * has to switch scheduling off — otherwise both processes drain the mail
 * outbox, reconcile payments and publish on the same minute. On the demo stand
 * (2026-09-28) it did not: `docker-compose.prod.yml` gives the container
 * `SCHEDULER_ENABLED=true`, and `ConfigModule.forRoot` snapshots the validated
 * environment when `app.module` is first imported. `ConfigService.get` reads that
 * snapshot before `process.env`, so assigning `'false'` after the import changes
 * nothing.
 *
 * Both cases below start from the production environment (`true`) and boot the
 * real `AppModule` in its own module registry, because the snapshot is taken
 * once per registry: the first case pins the trap the script fell into, so the
 * second one cannot pass vacuously.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- each module must be
   loaded inside `jest.isolateModules`, and Jest here has no native `import()` */
import type { INestApplicationContext } from '@nestjs/common';
import { createPermissionRepositoryMock } from './permission-repository.mock';

type AppModuleClass = new (...args: never[]) => unknown;

describe('search-reindex scheduling (e2e)', () => {
  const originalFlag = process.env.SCHEDULER_ENABLED;
  let app: INestApplicationContext | undefined;

  beforeEach(() => {
    // What the production container is given — setup-e2e sets 'false'.
    process.env.SCHEDULER_ENABLED = 'true';
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    process.env.SCHEDULER_ENABLED = originalFlag;
  });

  /**
   * Boot `AppModule` the way the script does and count the registered cron jobs.
   * Everything Nest-related is imported INSIDE the isolated registry: a
   * `SchedulerRegistry` class from the outer registry would be a different DI
   * token from the one the app registered.
   */
  async function cronJobsAfterBoot(loadAppModule: () => AppModuleClass): Promise<string[]> {
    let names: string[] = [];
    await jest.isolateModulesAsync(async () => {
      const AppModule = loadAppModule();
      const { Test } = require('@nestjs/testing') as typeof import('@nestjs/testing');
      const { SchedulerRegistry } =
        require('@nestjs/schedule') as typeof import('@nestjs/schedule');
      const { PrismaService } = require('../src/prisma') as typeof import('../src/prisma');
      const { PermissionRepository } =
        require('../src/auth/permissions') as typeof import('../src/auth/permissions');

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useValue({
          $connect: jest.fn(),
          $disconnect: jest.fn(),
          $queryRaw: jest.fn().mockResolvedValue([]),
        })
        .overrideProvider(PermissionRepository)
        .useValue(createPermissionRepositoryMock())
        .compile();
      app = await moduleRef.init();

      names = [...moduleRef.get(SchedulerRegistry).getCronJobs().keys()];
    });
    return names;
  }

  it('control: switching the flag off AFTER importing AppModule leaves the workers on', async () => {
    const jobs = await cronJobsAfterBoot(() => {
      const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
      process.env.SCHEDULER_ENABLED = 'false'; // what the script used to do
      return AppModule;
    });

    expect(jobs.length).toBeGreaterThan(0);
  });

  it('loadAppModuleWithoutScheduler boots with no cron job registered', async () => {
    const jobs = await cronJobsAfterBoot(() => {
      const { loadAppModuleWithoutScheduler } =
        require('../src/scripts/without-scheduler') as typeof import('../src/scripts/without-scheduler');
      return loadAppModuleWithoutScheduler();
    });

    expect(jobs).toEqual([]);
  });
});
