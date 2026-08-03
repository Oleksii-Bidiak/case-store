import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { PrismaService } from '../prisma';
import { OrderService } from '../order';
import { CacheService } from '../cache';
import { MailOutboxService } from '../mail-outbox';
import { LiqPayAdapter } from './adapters/liqpay/liqpay.adapter';
import { PaymentReconcileWorker } from './payment-reconcile.worker';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment.port';
import { PaymentService } from './payment.service';
import { PaymentModule } from './payment.module';
import { PermissionModule } from '../auth/permissions';
import { AuditModule } from '../audit';
import { PublishingModule } from '../publishing';

/**
 * DI-wiring test (no DB), mirroring `publishing.wiring.spec.ts`.
 *
 * Proves three things a unit test with hand-built mocks cannot: the real
 * PaymentModule + OrderModule graph resolves without a cycle, `PAYMENT_PROVIDER`
 * actually resolves to the LiqPay adapter, and the reconcile cron registers
 * under the name the ops runbook refers to. A broken module graph otherwise only
 * shows up when the whole app boots.
 */
const prismaStub = {
  payment: {},
  paymentEvent: {},
  order: {},
  $on: jest.fn(),
  $connect: jest.fn(),
};

@Global()
@Module({
  providers: [
    { provide: PrismaService, useValue: prismaStub },
    { provide: CacheService, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() } },
    { provide: MailOutboxService, useValue: { enqueue: jest.fn() } },
  ],
  exports: [PrismaService, CacheService, MailOutboxService],
})
class InfraStubModule {}

describe('PaymentModule wiring', () => {
  it('resolves the graph, binds LiqPay to PAYMENT_PROVIDER and schedules the reconcile cron', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          // Only what the transitively imported AuthModule needs to build its
          // JwtModule. No LIQPAY_* keys on purpose — see the isConfigured()
          // assertion below.
          load: [
            () => ({
              JWT_SECRET: 'test-jwt-secret-at-least-32-characters-long',
              JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-characters-long',
            }),
          ],
        }),
        // Integration (plan 167): PermissionModule is @Global(), but a test graph
        // still has to pull it in ONCE. Without it Nest cannot construct
        // PermissionGuard in the transitively imported admin controllers and the
        // whole compile fails — loudly, which is the right failure mode for a
        // security guard, and the reason WT-C chose explicit DI over a lazy lookup.
        // AuditModule too: PermissionController records who changed the matrix, so
        // the RBAC graph does not stand up without the audit graph. Both are
        // @Global() in the app; a test graph must still name them once.
        AuditModule,
        PermissionModule,
        // Same rule, third instance (TASK-384): PublishingModule is @Global(),
        // but the transitively imported ProductModule/CategoryModule now inject
        // RevalidationNotifier to purge the storefront after a catalogue write,
        // and a @Global() module still has to be named ONCE per graph.
        PublishingModule,
        ScheduleModule.forRoot(),
        LoggerModule.forRoot({ pinoHttp: { enabled: false } }),
        InfraStubModule,
        PaymentModule,
      ],
    }).compile();

    // The port is bound by token, so nothing outside adapters/ can couple to
    // LiqPay — and `useExisting` means it is the SAME instance, not a second one.
    const provider = moduleRef.get<PaymentProvider>(PAYMENT_PROVIDER);
    expect(provider).toBe(moduleRef.get(LiqPayAdapter));
    expect(provider.key).toBe('liqpay');

    // With no keys configured the module still boots; online payment is simply
    // unavailable rather than the app refusing to start.
    expect(provider.isConfigured()).toBe(false);
    expect(moduleRef.get(PaymentService).isAvailable()).toBe(false);

    // The payment module reaches the order module only through OrderService.
    expect(moduleRef.get(OrderService)).toBeInstanceOf(OrderService);

    const worker = moduleRef.get(PaymentReconcileWorker);
    worker.onModuleInit();
    const job = moduleRef.get(SchedulerRegistry).getCronJob('payment-reconcile');
    expect(job).toBeDefined();
    job.stop(); // do not leak the timer between suites

    await moduleRef.close();
  });
});
