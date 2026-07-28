import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { OrderStatus, Payment, PaymentAttemptStatus, PaymentStatus, Prisma } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import type { OrderEntity } from '../order';
import { OrderService } from '../order';
import type { Clock } from './payment.clock';
import type { PaymentProvider } from './payment.port';
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
  create: jest.fn(),
  findById: jest.fn(),
  findByOrderId: jest.fn(),
  insertEvent: jest.fn(),
  deleteEvent: jest.fn(),
  settle: jest.fn(),
};

const providerMock = {
  key: 'liqpay',
  isConfigured: jest.fn(() => true),
  createCheckout: jest.fn(),
  parseCallback: jest.fn(),
  fetchStatus: jest.fn(),
  refund: jest.fn(),
};

const orderServiceMock = {
  applyPaymentEvent: jest.fn(),
};

const configValues: Record<string, string> = {
  STORE_CLIENT_URL: 'https://shop.test',
  PUBLIC_BASE_URL: 'https://api.shop.test',
};

function buildService(): PaymentService {
  const configMock = {
    get: jest.fn((key: string, def?: unknown) => configValues[key] ?? def),
  };
  const clock: Clock = { now: () => NOW };

  return new PaymentService(
    repositoryMock as unknown as PaymentRepository,
    providerMock as unknown as PaymentProvider,
    orderServiceMock as unknown as OrderService,
    configMock as unknown as ConfigService,
    clock,
    loggerMock as unknown as PinoLogger,
  );
}

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'pay-1',
    orderId: 'order-1',
    provider: 'liqpay',
    providerPaymentId: null,
    amount: new Prisma.Decimal('1249.00'),
    currency: 'UAH',
    status: PaymentAttemptStatus.PENDING,
    failureCode: null,
    failureMessage: null,
    createdAt: NOW,
    updatedAt: NOW,
    settledAt: null,
    ...overrides,
  } as Payment;
}

function makeEvent(overrides: Partial<PaymentEventInput> = {}): PaymentEventInput {
  return {
    paymentId: 'pay-1',
    providerStatus: 'success',
    providerPaymentId: '99',
    outcome: PaymentOutcome.SUCCEEDED,
    amount: '1249.00',
    currency: 'UAH',
    payload: { order_id: 'pay-1', status: 'success' },
    ...overrides,
  };
}

/** The Prisma error a unique-constraint violation raises. */
function duplicateKeyError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.9.1',
  });
}

function makeOrder(overrides: Partial<OrderEntity> = {}): OrderEntity {
  return {
    id: 'order-1',
    status: OrderStatus.PENDING,
    paymentStatus: PaymentStatus.PENDING,
    total: '1249.00',
    ...overrides,
  } as OrderEntity;
}

describe('PaymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    providerMock.isConfigured.mockReturnValue(true);
    repositoryMock.insertEvent.mockResolvedValue({ id: 'evt-1' });
    repositoryMock.settle.mockResolvedValue(makePayment());
    orderServiceMock.applyPaymentEvent.mockResolvedValue({ applied: true, orderId: 'order-1' });
  });

  describe('createCheckout', () => {
    beforeEach(() => {
      repositoryMock.create.mockResolvedValue(makePayment());
      providerMock.createCheckout.mockResolvedValue({
        url: 'https://www.liqpay.ua/api/3/checkout',
        method: 'POST',
        fields: { data: 'ZGF0YQ==', signature: 'sig' },
      });
    });

    it('sends the PAYMENT id to the provider, never the order id', async () => {
      await buildService().createCheckout(makeOrder());

      expect(providerMock.createCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ paymentId: 'pay-1' }),
      );
      // The bug this guards: an order id burned by the first declined card
      // leaves the customer permanently unable to pay.
      expect(providerMock.createCheckout.mock.calls[0][0].paymentId).not.toBe('order-1');
    });

    it('opens a NEW attempt on every call — that is how retry works', async () => {
      const service = buildService();
      repositoryMock.create
        .mockResolvedValueOnce(makePayment({ id: 'pay-1' }))
        .mockResolvedValueOnce(makePayment({ id: 'pay-2' }));

      const first = await service.createCheckout(makeOrder());
      const second = await service.createCheckout(makeOrder());

      expect(first.paymentId).toBe('pay-1');
      expect(second.paymentId).toBe('pay-2');
      expect(repositoryMock.create).toHaveBeenCalledTimes(2);
    });

    it('records the order total as the amount to collect', async () => {
      await buildService().createCheckout(makeOrder({ total: '999.50' }));

      expect(repositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'order-1', amount: '999.50', provider: 'liqpay' }),
      );
    });

    it('builds the callback URL on the API origin and the return URL on the storefront', async () => {
      await buildService().createCheckout(makeOrder());

      expect(providerMock.createCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackUrl: 'https://api.shop.test/api/payments/liqpay/callback',
          resultUrl: 'https://shop.test/orders/order-1/confirmation',
        }),
      );
    });

    it('refuses to open an attempt for an already-paid order', async () => {
      await expect(
        buildService().createCheckout(makeOrder({ paymentStatus: PaymentStatus.PAID })),
      ).rejects.toThrow(ConflictException);
      expect(repositoryMock.create).not.toHaveBeenCalled();
    });

    it('refuses to open an attempt for a cancelled order', async () => {
      await expect(
        buildService().createCheckout(makeOrder({ status: OrderStatus.CANCELLED })),
      ).rejects.toThrow(ConflictException);
    });

    it('503s when the provider has no credentials', async () => {
      providerMock.isConfigured.mockReturnValue(false);

      await expect(buildService().createCheckout(makeOrder())).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('handleCallback', () => {
    it('returns null when the adapter cannot verify the signature', async () => {
      providerMock.parseCallback.mockResolvedValue(null);

      expect(await buildService().handleCallback({ data: 'x', signature: 'forged' })).toBeNull();
      expect(repositoryMock.insertEvent).not.toHaveBeenCalled();
      expect(orderServiceMock.applyPaymentEvent).not.toHaveBeenCalled();
    });

    it('applies a verified event', async () => {
      providerMock.parseCallback.mockResolvedValue(makeEvent());
      repositoryMock.findById.mockResolvedValue(makePayment());

      const result = await buildService().handleCallback({ data: 'x', signature: 'y' });

      expect(result).toEqual({ applied: true, orderId: 'order-1' });
    });
  });

  describe('idempotency — the DB constraint, not an if', () => {
    it('treats a duplicate-key rejection as "already seen" and changes nothing', async () => {
      repositoryMock.findById.mockResolvedValue(makePayment());
      repositoryMock.insertEvent.mockRejectedValue(duplicateKeyError());

      const result = await buildService().applyEvent(makeEvent());

      expect(result).toEqual({ applied: false, orderId: 'order-1' });
      expect(orderServiceMock.applyPaymentEvent).not.toHaveBeenCalled();
      expect(repositoryMock.settle).not.toHaveBeenCalled();
    });

    it('never pre-checks with a read — the insert IS the check', async () => {
      repositoryMock.findById.mockResolvedValue(makePayment());

      await buildService().applyEvent(makeEvent());

      // Only the payment lookup. A findEvent/exists call here would be the bug:
      // two concurrent callbacks both pass a SELECT.
      expect(repositoryMock.findById).toHaveBeenCalledTimes(1);
      expect(repositoryMock.insertEvent).toHaveBeenCalledTimes(1);
    });

    it('a repeated callback applies the order change exactly once', async () => {
      const service = buildService();
      repositoryMock.findById.mockResolvedValue(makePayment());
      repositoryMock.insertEvent
        .mockResolvedValueOnce({ id: 'evt-1' })
        .mockRejectedValueOnce(duplicateKeyError())
        .mockRejectedValueOnce(duplicateKeyError());

      await service.applyEvent(makeEvent());
      await service.applyEvent(makeEvent());
      await service.applyEvent(makeEvent());

      expect(orderServiceMock.applyPaymentEvent).toHaveBeenCalledTimes(1);
      expect(repositoryMock.settle).toHaveBeenCalledTimes(1);
    });

    it('rethrows a non-duplicate database error instead of silently swallowing it', async () => {
      repositoryMock.findById.mockResolvedValue(makePayment());
      repositoryMock.insertEvent.mockRejectedValue(new Error('connection reset'));

      await expect(buildService().applyEvent(makeEvent())).rejects.toThrow('connection reset');
    });

    it('releases the claim when applying to the order fails, so a retry can work', async () => {
      repositoryMock.findById.mockResolvedValue(makePayment());
      orderServiceMock.applyPaymentEvent.mockRejectedValue(new Error('order db down'));

      await expect(buildService().applyEvent(makeEvent())).rejects.toThrow('order db down');
      // Without this the provider's retry would hit the unique constraint, be
      // classified as a duplicate, and the order would never be marked paid.
      expect(repositoryMock.deleteEvent).toHaveBeenCalledWith('evt-1');
    });
  });

  describe('money verification', () => {
    it('rejects a tampered amount before recording anything', async () => {
      repositoryMock.findById.mockResolvedValue(
        makePayment({ amount: new Prisma.Decimal('1249.00') }),
      );

      await expect(buildService().applyEvent(makeEvent({ amount: '1.00' }))).rejects.toThrow(
        BadRequestException,
      );
      expect(repositoryMock.insertEvent).not.toHaveBeenCalled();
      expect(orderServiceMock.applyPaymentEvent).not.toHaveBeenCalled();
    });

    it('rejects a mismatched currency', async () => {
      repositoryMock.findById.mockResolvedValue(makePayment());

      await expect(buildService().applyEvent(makeEvent({ currency: 'USD' }))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('accepts an equal amount written differently (1249 vs 1249.00)', async () => {
      repositoryMock.findById.mockResolvedValue(makePayment());

      await expect(buildService().applyEvent(makeEvent({ amount: '1249' }))).resolves.toEqual({
        applied: true,
        orderId: 'order-1',
      });
    });

    it('accepts a lowercase currency', async () => {
      repositoryMock.findById.mockResolvedValue(makePayment());

      await expect(
        buildService().applyEvent(makeEvent({ currency: 'uah' })),
      ).resolves.toMatchObject({ applied: true });
    });

    it('rejects an unparsable amount on a success event', async () => {
      repositoryMock.findById.mockResolvedValue(makePayment());

      await expect(buildService().applyEvent(makeEvent({ amount: '' }))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('allows a PARTIAL refund to report less than was charged', async () => {
      repositoryMock.findById.mockResolvedValue(makePayment());

      await expect(
        buildService().applyEvent(
          makeEvent({
            outcome: PaymentOutcome.REFUNDED,
            providerStatus: 'reversed',
            amount: '200.00',
          }),
        ),
      ).resolves.toMatchObject({ applied: true });
    });

    it('rejects a refund larger than the amount paid', async () => {
      repositoryMock.findById.mockResolvedValue(makePayment());

      await expect(
        buildService().applyEvent(
          makeEvent({
            outcome: PaymentOutcome.REFUNDED,
            providerStatus: 'reversed',
            amount: '9999',
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('does not demand an amount on a failure — no money moved', async () => {
      repositoryMock.findById.mockResolvedValue(makePayment());

      await expect(
        buildService().applyEvent(
          makeEvent({
            outcome: PaymentOutcome.FAILED,
            providerStatus: 'failure',
            amount: '',
            currency: '',
          }),
        ),
      ).resolves.toMatchObject({ applied: true });
    });
  });

  describe('outcome handling', () => {
    beforeEach(() => repositoryMock.findById.mockResolvedValue(makePayment()));

    it('records an in-progress event but does NOT touch the order', async () => {
      const result = await buildService().applyEvent(
        makeEvent({ outcome: PaymentOutcome.IGNORED, providerStatus: 'wait_secure' }),
      );

      expect(repositoryMock.insertEvent).toHaveBeenCalledTimes(1);
      // Treating "not finished yet" as actionable is how an order flips to paid
      // before the money exists.
      expect(orderServiceMock.applyPaymentEvent).not.toHaveBeenCalled();
      expect(repositoryMock.settle).not.toHaveBeenCalled();
      expect(result).toEqual({ applied: false, orderId: 'order-1' });
    });

    it('settles a success as SUCCEEDED with the provider id and a timestamp', async () => {
      await buildService().applyEvent(makeEvent());

      expect(repositoryMock.settle).toHaveBeenCalledWith(
        'pay-1',
        expect.objectContaining({
          status: PaymentAttemptStatus.SUCCEEDED,
          providerPaymentId: '99',
          settledAt: NOW,
        }),
      );
    });

    it('settles a failure as FAILED and keeps the provider error details', async () => {
      await buildService().applyEvent(
        makeEvent({
          outcome: PaymentOutcome.FAILED,
          providerStatus: 'failure',
          failureCode: '9859',
          failureMessage: 'limit exceeded',
        }),
      );

      expect(repositoryMock.settle).toHaveBeenCalledWith(
        'pay-1',
        expect.objectContaining({
          status: PaymentAttemptStatus.FAILED,
          failureCode: '9859',
          failureMessage: 'limit exceeded',
        }),
      );
    });

    it('settles a reversal as REFUNDED', async () => {
      await buildService().applyEvent(
        makeEvent({
          outcome: PaymentOutcome.REFUNDED,
          providerStatus: 'reversed',
          amount: '1249.00',
        }),
      );

      expect(repositoryMock.settle).toHaveBeenCalledWith(
        'pay-1',
        expect.objectContaining({ status: PaymentAttemptStatus.REFUNDED }),
      );
    });

    it('routes every order change through OrderService — never a direct write', async () => {
      const event = makeEvent();

      await buildService().applyEvent(event);

      expect(orderServiceMock.applyPaymentEvent).toHaveBeenCalledWith(event);
    });
  });

  describe('unknown payment', () => {
    it('does not throw for a verified event naming a payment we have never seen', async () => {
      repositoryMock.findById.mockResolvedValue(null);

      // Retrying cannot help, so answering non-200 would only start a retry
      // storm. Nothing changes, and the log is loud.
      const result = await buildService().applyEvent(makeEvent({ paymentId: 'ghost' }));

      expect(result).toEqual({ applied: false, orderId: '' });
      expect(repositoryMock.insertEvent).not.toHaveBeenCalled();
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'payment.event.unknown_payment' }),
        expect.any(String),
      );
    });
  });

  describe('refund', () => {
    it('asks the provider and does NOT mark the payment refunded itself', async () => {
      repositoryMock.findById.mockResolvedValue(
        makePayment({ status: PaymentAttemptStatus.SUCCEEDED }),
      );

      await buildService().refund('pay-1');

      expect(providerMock.refund).toHaveBeenCalledWith({ paymentId: 'pay-1', amount: '1249' });
      // REFUNDED is confirmed by the `reversed` callback, so the label can never
      // claim a refund that did not happen (E-12).
      expect(repositoryMock.settle).not.toHaveBeenCalled();
    });

    it('supports a partial refund amount', async () => {
      repositoryMock.findById.mockResolvedValue(
        makePayment({ status: PaymentAttemptStatus.SUCCEEDED }),
      );

      await buildService().refund('pay-1', '200.00');

      expect(providerMock.refund).toHaveBeenCalledWith({ paymentId: 'pay-1', amount: '200.00' });
    });

    it('refuses to refund more than was paid', async () => {
      repositoryMock.findById.mockResolvedValue(
        makePayment({ status: PaymentAttemptStatus.SUCCEEDED }),
      );

      await expect(buildService().refund('pay-1', '99999')).rejects.toThrow(BadRequestException);
      expect(providerMock.refund).not.toHaveBeenCalled();
    });

    it('refuses to refund an attempt that never succeeded', async () => {
      repositoryMock.findById.mockResolvedValue(
        makePayment({ status: PaymentAttemptStatus.FAILED }),
      );

      await expect(buildService().refund('pay-1')).rejects.toThrow(ConflictException);
      expect(providerMock.refund).not.toHaveBeenCalled();
    });

    it('404s an unknown payment', async () => {
      repositoryMock.findById.mockResolvedValue(null);

      await expect(buildService().refund('ghost')).rejects.toThrow(NotFoundException);
    });
  });
});
