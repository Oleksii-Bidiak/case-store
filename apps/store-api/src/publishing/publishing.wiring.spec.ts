import { Global, Module } from '@nestjs/common';
import { PermissionGuard } from '../auth/permissions';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma';
import { PagesModule } from '../pages';
import { PublishingModule, PublishingScheduler } from '.';
import { type PublishablePort } from './publishing.tokens';
import { PageRepository } from '../pages/pages.repository';

/**
 * DI-wiring test (no DB): proves the real PublishingModule + PagesModule graph
 * resolves without a cycle and that the scheduler discovers PageRepository under
 * PUBLISHABLE_REPOSITORY. PrismaService is stubbed so nothing connects.
 */
const prismaStub = { page: {} };

@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: prismaStub }],
  exports: [PrismaService],
})
class PrismaStubModule {}

describe('PublishingModule wiring', () => {
  it('resolves the graph and discovers PageRepository as a publisher', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ScheduleModule.forRoot(),
        LoggerModule.forRoot({ pinoHttp: { enabled: false } }),
        PrismaStubModule,
        PublishingModule,
        PagesModule,
      ],
    })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const scheduler = moduleRef.get(PublishingScheduler);
    // Exercise the real DiscoveryService against the real container.
    const publishers = (
      scheduler as unknown as { collectPublishers(): PublishablePort[] }
    ).collectPublishers();

    const pageRepo = moduleRef.get(PageRepository);
    expect(publishers).toContain(pageRepo);
    expect(publishers[0].revalidateTarget).toEqual({ tags: ['pages'], paths: ['/legal'] });

    // Register + immediately stop the cron so its timer does not leak.
    scheduler.onModuleInit();
    moduleRef.get(SchedulerRegistry).getCronJob('publishing-publish-due').stop();
  });
});
