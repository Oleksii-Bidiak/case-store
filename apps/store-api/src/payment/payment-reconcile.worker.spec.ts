import type { ConfigService } from '@nestjs/config';
import type { SchedulerRegistry } from '@nestjs/schedule';
import { OrderStatus, PaymentAttemptStatus, Prisma } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { OrderService } from '../order';
import type { Clock } from './payment.clock';
import type { PaymentProvider } from './payment.port';
import { PaymentReconcileWorker } from './payment-reconcile.worker';
import { PaymentRepository } from './payment.repository';
import { PaymentService } from './payment.service';
import { PaymentOutcome, type PaymentEventInput } from './payment.types';

const NOW = new Date('2026-07-28T12:00:00.000Z');

const loggerMock = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  setContext: jest.fn(),
};

const repositoryMock = {
  findPendingOlderThan: jest.fn(),
  findExpiredReservations: jest.fn(),
  markExpiredByOrderId: jest.fn(),
};

const providerMock = {
  key: 'liqpay',
  isConfigured: jest.fn(() => true),
  createCheckout: jest.fn(),
  parseCallback: jest.fn(),
  fetchStatus: jest.fn(),
  refund: jest.fn(),
};

const paymentServiceMock = { applyEvent: jest.fn() };
const orderServiceMock = { updateStatus: jest.fn() };
const schedulerRegistryMock = { addCronJob: jest.fn() };

function buildWorker(env: Record<string, string | undefined> = {}): PaymentReconcileWorker {
  const configMock = {
    get: jest.fn((key: string, def?: unknown) => (key in env ? env[key] : def)),
  };
  const clock: Clock = { now: () => NOW };

  return new PaymentReconcileWorker(
    repositoryMock as unknown as PaymentRepository,
    paymentServiceMock as unknown as PaymentService,
    providerMock as unknown as PaymentProvider,
    orderServiceMock as unknown as OrderService,
    configMock as unknown as ConfigService,
    schedulerRegistryMock as unknown as SchedulerRegistry,
    clock,
    loggerMock as unknown as PinoLogger,
  );
}

function pendingPayment(id: string, createdAt = new Date('2026-07-28T11:00:00.000Z')) {
  return {
    id,
    orderId: `order-of-${id}`,
    provider: 'liqpay',
    amount: new Prisma.Decimal('1249.00'),
    currency: 'UAH',
    status: PaymentAttemptStatus.PENDING,
    createdAt,
  };
}

function event(overrides: Partial<PaymentEventInput> = {}): PaymentEventInput {
  return {
    paymentId: 'pay-1',
    providerStatus: 'success',
    providerPaymentId: '99',
    outcome: PaymentOutcome.SUCCEEDED,
    amount: '1249.00',
    currency: 'UAH',
    payload: {},
    ...overrides,
  };
}

describe('PaymentReconcileWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    providerMock.isConfigured.mockReturnValue(true);
    repositoryMock.findPendingOlderThan.mockResolvedValue([]);
    repositoryMock.findExpiredReservations.mockResolvedValue([]);
    repositoryMock.markExpiredByOrderId.mockResolvedValue(1);
    paymentServiceMock.applyEvent.mockResolvedValue({ applied: true, orderId: 'order-1' });
  });

  describe('onModuleInit', () => {
    it('registers and starts a cron job using the configured expression', () => {
      const worker = buildWorker({ PAYMENT_RECONCILE_CRON: '*/5 * * * *' });

      worker.onModuleInit();

      expect(schedulerRegistryMock.addCronJob).toHaveBeenCalledWith(
        'payment-reconcile',
        expect.anything(),
      );
      const job = schedulerRegistryMock.addCronJob.mock.calls[0][1];
      expect(job.cronTime.source).toBe('*/5 * * * *');
      job.stop();
    });

    it('defaults to every minute', () => {
      buildWorker().onModuleInit();

      const job = schedulerRegistryMock.addCronJob.mock.calls[0][1];
      expect(job.cronTime.source).toBe('* * * * *');
      job.stop();
    });
  });

  describe('polling pending attempts', () => {
    it('only polls attempts older than the grace period', async () => {
      await buildWorker().tick();

      const [cutoff, limit] = repositoryMock.findPendingOlderThan.mock.calls[0];
      // 2-minute grace: polling sooner just spends API calls to be told
      // "wait_secure" while the customer types a 3DS code.
      expect(cutoff).toEqual(new Date('2026-07-28T11:58:00.000Z'));
      expect(limit).toBeGreaterThan(0);
    });

    it('applies a status the callback never delivered — the whole point of the worker', async () => {
      repositoryMock.findPendingOlderThan.mockResolvedValue([pendingPayment('pay-1')]);
      providerMock.fetchStatus.mockResolvedValue(event());

      await buildWorker().tick();

      expect(providerMock.fetchStatus).toHaveBeenCalledWith('pay-1');
      expect(paymentServiceMock.applyEvent).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: PaymentOutcome.SUCCEEDED }),
      );
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'payment.reconcile.recovered' }),
        expect.any(String),
      );
    });

    it('leaves an attempt PENDING when the provider cannot be reached', async () => {
      repositoryMock.findPendingOlderThan.mockResolvedValue([pendingPayment('pay-1')]);
      providerMock.fetchStatus.mockResolvedValue(null);

      await buildWorker().tick();

      // "I could not find out" must never be recorded as "it failed".
      expect(paymentServiceMock.applyEvent).not.toHaveBeenCalled();
    });

    it('does not record a still-in-progress poll result', async () => {
      repositoryMock.findPendingOlderThan.mockResolvedValue([pendingPayment('pay-1')]);
      providerMock.fetchStatus.mockResolvedValue(
        event({ outcome: PaymentOutcome.IGNORED, providerStatus: 'wait_secure' }),
      );

      await buildWorker().tick();

      expect(paymentServiceMock.applyEvent).not.toHaveBeenCalled();
    });

    it('carries on with the batch when one attempt fails', async () => {
      repositoryMock.findPendingOlderThan.mockResolvedValue([
        pendingPayment('pay-1'),
        pendingPayment('pay-2'),
      ]);
      providerMock.fetchStatus
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(event({ paymentId: 'pay-2' }));

      await buildWorker().tick();

      expect(paymentServiceMock.applyEvent).toHaveBeenCalledTimes(1);
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'payment.reconcile.attempt_failed' }),
        expect.any(String),
      );
    });

    it('does nothing when the provider is not configured', async () => {
      providerMock.isConfigured.mockReturnValue(false);

      await buildWorker().tick();

      expect(repositoryMock.findPendingOlderThan).not.toHaveBeenCalled();
    });
  });

  describe('expiring stale reservations', () => {
    const expired = [
      {
        id: 'order-1',
        status: OrderStatus.PENDING,
        reservationExpiresAt: new Date('2026-07-28T11:30:00.000Z'),
      },
    ];

    it('cancels through OrderService — never a direct write to the order', async () => {
      repositoryMock.findExpiredReservations.mockResolvedValue(expired);

      await buildWorker().tick();

      expect(orderServiceMock.updateStatus).toHaveBeenCalledWith(
        'order-1',
        OrderStatus.CANCELLED,
        // `changedBy: null` — a cron tick has no acting user.
        null,
      );
    });

    it('marks the order’s pending attempts EXPIRED', async () => {
      repositoryMock.findExpiredReservations.mockResolvedValue(expired);

      await buildWorker().tick();

      expect(repositoryMock.markExpiredByOrderId).toHaveBeenCalledWith('order-1');
    });

    it('polls for late payments BEFORE cancelling anything', async () => {
      const calls: string[] = [];
      repositoryMock.findPendingOlderThan.mockImplementation(() => {
        calls.push('poll');
        return Promise.resolve([]);
      });
      repositoryMock.findExpiredReservations.mockImplementation(() => {
        calls.push('expire');
        return Promise.resolve([]);
      });

      await buildWorker().tick();

      // This ordering is the protection against "order cancelled although the
      // customer paid": a success applied in step 1 clears the deadline that
      // step 2 reads.
      expect(calls).toEqual(['poll', 'expire']);
    });

    it('is disabled by ORDER_AUTOCANCEL_UNPAID=false', async () => {
      await buildWorker({ ORDER_AUTOCANCEL_UNPAID: 'false' }).tick();

      expect(repositoryMock.findExpiredReservations).not.toHaveBeenCalled();
    });

    it('stays enabled for any other value — a typo must not disable stock recovery', async () => {
      await buildWorker({ ORDER_AUTOCANCEL_UNPAID: 'FALSE' }).tick();

      expect(repositoryMock.findExpiredReservations).toHaveBeenCalled();
    });

    it('is enabled by default', async () => {
      await buildWorker().tick();

      expect(repositoryMock.findExpiredReservations).toHaveBeenCalledWith(NOW, expect.any(Number));
    });

    it('carries on with the batch when one cancellation fails', async () => {
      repositoryMock.findExpiredReservations.mockResolvedValue([
        ...expired,
        { id: 'order-2', status: OrderStatus.PENDING, reservationExpiresAt: NOW },
      ]);
      orderServiceMock.updateStatus.mockRejectedValueOnce(new Error('conflict'));

      await buildWorker().tick();

      expect(orderServiceMock.updateStatus).toHaveBeenCalledTimes(2);
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'payment.reconcile.expire_failed' }),
        expect.any(String),
      );
    });
  });

  describe('tick resilience', () => {
    it('swallows and logs an error instead of killing the scheduler', async () => {
      repositoryMock.findPendingOlderThan.mockRejectedValue(new Error('db down'));

      await expect(buildWorker().tick()).resolves.toBeUndefined();
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'payment.reconcile.error' }),
        expect.any(String),
      );
    });
  });
});
