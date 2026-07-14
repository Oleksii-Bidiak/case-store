import { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { MailOutbox, MailOutboxStatus } from '@prisma/client';
import { MailOutboxService } from './mail-outbox.service';
import { MailOutboxRepository } from './mail-outbox.repository';
import { MailService } from '../mail/mail.service';
import type { Clock } from './mail-outbox.clock';
import {
  ACCOUNT_LOCKED_MAIL_TYPE,
  ORDER_CONFIRMATION_MAIL_TYPE,
  PASSWORD_RESET_MAIL_TYPE,
} from './mail-outbox.types';
import type { OrderConfirmationMailPayload } from '../mail/templates/order-confirmation.template';
import type { PasswordResetMailPayload } from '../mail/templates/password-reset.template';
import type { AccountLockedMailPayload } from '../mail/templates/account-locked.template';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const NOW = new Date('2026-06-30T12:00:00.000Z');
const BASE_MS = 1000; // 1s base backoff (test-only — keeps the math readable)
const MAX_MS = 10_000; // 10s cap

const samplePayload: OrderConfirmationMailPayload = {
  to: 'buyer@example.com',
  customerName: 'Olena',
  order: {
    id: 'order-uuid-1234',
    createdAt: '2026-06-30T11:00:00.000Z',
    items: [{ productName: 'Case', quantity: 1, price: '10.00', lineTotal: '10.00' }],
    subtotal: '10.00',
    discount: '0.00',
    shippingCost: '0.00',
    tax: '0.00',
    total: '10.00',
    shippingAddress: null,
  },
};

const makeRow = (overrides: Partial<MailOutbox> = {}): MailOutbox =>
  ({
    id: 'outbox-1',
    type: ORDER_CONFIRMATION_MAIL_TYPE,
    recipient: 'buyer@example.com',
    payload: samplePayload as unknown as MailOutbox['payload'],
    status: MailOutboxStatus.PENDING,
    attempts: 0,
    maxAttempts: 5,
    lastError: null,
    nextAttemptAt: NOW,
    createdAt: NOW,
    sentAt: null,
    ...overrides,
  }) as MailOutbox;

// ─── Mocks ───────────────────────────────────────────────────────────────────

const repositoryMock = {
  enqueue: jest.fn(),
  claimDue: jest.fn(),
  markSent: jest.fn(),
  markRetry: jest.fn(),
  markFailed: jest.fn(),
  hasRecentByTypeAndRecipient: jest.fn(),
};

const mailServiceMock = {
  isEnabled: jest.fn(),
  sendOrderConfirmationPayload: jest.fn(),
  sendPasswordResetPayload: jest.fn(),
  sendAccountLockedPayload: jest.fn(),
};

const loggerMock = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  setContext: jest.fn(),
};

const clock: Clock = { now: () => NOW };

function makeConfig(nodeEnv = 'test'): ConfigService {
  return {
    get: jest.fn((key: string, def?: unknown) => {
      const values: Record<string, unknown> = {
        MAIL_OUTBOX_BACKOFF_BASE_MS: BASE_MS,
        MAIL_OUTBOX_BACKOFF_MAX_MS: MAX_MS,
        MAIL_OUTBOX_BATCH_SIZE: 25,
        NODE_ENV: nodeEnv,
      };
      return key in values ? values[key] : def;
    }),
  } as unknown as ConfigService;
}

function buildService(nodeEnv = 'test'): MailOutboxService {
  return new MailOutboxService(
    repositoryMock as unknown as MailOutboxRepository,
    mailServiceMock as unknown as MailService,
    makeConfig(nodeEnv),
    loggerMock as unknown as PinoLogger,
    clock,
  );
}

describe('MailOutboxService', () => {
  let service: MailOutboxService;

  beforeEach(() => {
    jest.clearAllMocks();
    mailServiceMock.isEnabled.mockReturnValue(true);
    repositoryMock.claimDue.mockResolvedValue([]);
    repositoryMock.markSent.mockResolvedValue(undefined);
    repositoryMock.markRetry.mockResolvedValue(undefined);
    repositoryMock.markFailed.mockResolvedValue(undefined);
    service = buildService();
  });

  // ─── enqueueOrderConfirmation ─────────────────────────────────────────────────

  describe('enqueueOrderConfirmation', () => {
    it('serializes the params into an order-confirmation row and forwards the tx', async () => {
      const tx = { mailOutbox: {} } as never;
      const order = {
        id: 'order-uuid-1234',
        createdAt: new Date('2026-06-30T11:00:00.000Z'),
        items: [{ productName: 'Case', quantity: 1, price: '10.00', lineTotal: '10.00' }],
        subtotal: '10.00',
        discount: '0.00',
        shippingCost: '0.00',
        tax: '0.00',
        total: '10.00',
        shippingAddress: null,
      };

      await service.enqueueOrderConfirmation(
        { to: 'buyer@example.com', order: order as never, customerName: 'Olena' },
        tx,
      );

      expect(repositoryMock.enqueue).toHaveBeenCalledTimes(1);
      const [params, passedTx] = repositoryMock.enqueue.mock.calls[0];
      expect(params.type).toBe(ORDER_CONFIRMATION_MAIL_TYPE);
      expect(params.recipient).toBe('buyer@example.com');
      expect(params.payload).toMatchObject({ to: 'buyer@example.com', customerName: 'Olena' });
      // createdAt is serialized to an ISO string in the stored payload.
      expect(params.payload.order.createdAt).toBe('2026-06-30T11:00:00.000Z');
      expect(passedTx).toBe(tx);
    });
  });

  // ─── enqueuePasswordReset ─────────────────────────────────────────────────────

  describe('enqueuePasswordReset', () => {
    it('writes a password-reset row with the type and recipient from the payload', async () => {
      const payload: PasswordResetMailPayload = {
        to: 'user@example.com',
        resetUrl: 'http://localhost:3000/reset-password?token=abc',
        expiresInHuman: '1 годину',
      };

      await service.enqueuePasswordReset(payload);

      expect(repositoryMock.enqueue).toHaveBeenCalledTimes(1);
      const [params] = repositoryMock.enqueue.mock.calls[0];
      expect(params.type).toBe(PASSWORD_RESET_MAIL_TYPE);
      expect(params.recipient).toBe('user@example.com');
      expect(params.payload).toMatchObject(payload);
    });
  });

  // ─── account-locked notice (TASK-287) ────────────────────────────────────────

  describe('enqueueAccountLockedNotice', () => {
    it('writes an account-locked row with the type and recipient from the payload', async () => {
      const payload: AccountLockedMailPayload = {
        to: 'banned@example.com',
        supportUrl: 'http://localhost:3000/contact',
      };

      await service.enqueueAccountLockedNotice(payload);

      expect(repositoryMock.enqueue).toHaveBeenCalledTimes(1);
      const [params] = repositoryMock.enqueue.mock.calls[0];
      expect(params.type).toBe(ACCOUNT_LOCKED_MAIL_TYPE);
      expect(params.recipient).toBe('banned@example.com');
      expect(params.payload).toMatchObject(payload);
    });
  });

  describe('hasRecentAccountLockedNotice', () => {
    it('asks the repository for a row of this type for this recipient since the window start', async () => {
      const since = new Date('2026-07-10T12:00:00.000Z');
      repositoryMock.hasRecentByTypeAndRecipient.mockResolvedValue(true);

      await expect(service.hasRecentAccountLockedNotice('banned@example.com', since)).resolves.toBe(
        true,
      );

      expect(repositoryMock.hasRecentByTypeAndRecipient).toHaveBeenCalledWith(
        ACCOUNT_LOCKED_MAIL_TYPE,
        'banned@example.com',
        since,
      );
    });
  });

  describe('dispatchDue — account-locked delivery', () => {
    it('routes an account-locked row to sendAccountLockedPayload', async () => {
      const payload: AccountLockedMailPayload = {
        to: 'banned@example.com',
        supportUrl: 'http://localhost:3000/contact',
      };
      repositoryMock.claimDue.mockResolvedValue([
        makeRow({
          id: 'al-1',
          type: ACCOUNT_LOCKED_MAIL_TYPE,
          payload: payload as unknown as MailOutbox['payload'],
        }),
      ]);
      mailServiceMock.sendAccountLockedPayload.mockResolvedValue(undefined);

      const result = await service.dispatchDue();

      expect(mailServiceMock.sendAccountLockedPayload).toHaveBeenCalledWith(payload);
      expect(repositoryMock.markSent).toHaveBeenCalledWith('al-1', NOW);
      expect(result).toEqual({ sent: 1, retried: 0, failed: 0 });
    });
  });

  // ─── dispatchDue — password-reset delivery ────────────────────────────────────

  describe('dispatchDue — password-reset delivery', () => {
    it('routes a password-reset row to sendPasswordResetPayload', async () => {
      const payload: PasswordResetMailPayload = {
        to: 'user@example.com',
        resetUrl: 'http://localhost:3000/reset-password?token=abc',
        expiresInHuman: '1 годину',
      };
      repositoryMock.claimDue.mockResolvedValue([
        makeRow({
          id: 'pr-1',
          type: PASSWORD_RESET_MAIL_TYPE,
          payload: payload as unknown as MailOutbox['payload'],
        }),
      ]);
      mailServiceMock.sendPasswordResetPayload.mockResolvedValue(undefined);

      const result = await service.dispatchDue();

      expect(mailServiceMock.sendPasswordResetPayload).toHaveBeenCalledWith(payload);
      expect(mailServiceMock.sendOrderConfirmationPayload).not.toHaveBeenCalled();
      expect(repositoryMock.markSent).toHaveBeenCalledWith('pr-1', NOW);
      expect(result).toEqual({ sent: 1, retried: 0, failed: 0 });
    });
  });

  // ─── dispatchDue — empty ──────────────────────────────────────────────────────

  describe('dispatchDue — nothing due', () => {
    it('returns zeroed counts and performs no sends when no rows are due', async () => {
      repositoryMock.claimDue.mockResolvedValue([]);

      const result = await service.dispatchDue();

      expect(result).toEqual({ sent: 0, retried: 0, failed: 0 });
      expect(mailServiceMock.sendOrderConfirmationPayload).not.toHaveBeenCalled();
    });

    it('claims due rows using the injected clock and configured batch size', async () => {
      await service.dispatchDue();

      expect(repositoryMock.claimDue).toHaveBeenCalledWith(NOW, 25);
    });
  });

  // ─── dispatchDue — success ────────────────────────────────────────────────────

  describe('dispatchDue — success → SENT', () => {
    it('renders+sends each due row and marks it SENT', async () => {
      repositoryMock.claimDue.mockResolvedValue([makeRow()]);
      mailServiceMock.sendOrderConfirmationPayload.mockResolvedValue(undefined);

      const result = await service.dispatchDue();

      expect(mailServiceMock.sendOrderConfirmationPayload).toHaveBeenCalledWith(samplePayload);
      expect(repositoryMock.markSent).toHaveBeenCalledWith('outbox-1', NOW);
      expect(result).toEqual({ sent: 1, retried: 0, failed: 0 });
    });

    it('counts multiple successful sends', async () => {
      repositoryMock.claimDue.mockResolvedValue([
        makeRow({ id: 'a' }),
        makeRow({ id: 'b' }),
        makeRow({ id: 'c' }),
      ]);
      mailServiceMock.sendOrderConfirmationPayload.mockResolvedValue(undefined);

      const result = await service.dispatchDue();

      expect(result.sent).toBe(3);
      expect(repositoryMock.markSent).toHaveBeenCalledTimes(3);
    });
  });

  // ─── dispatchDue — transient failure → retry with backoff ─────────────────────

  describe('dispatchDue — transient failure → retry', () => {
    it('marks a first-attempt failure for retry with the base backoff window', async () => {
      repositoryMock.claimDue.mockResolvedValue([makeRow({ attempts: 0 })]);
      mailServiceMock.sendOrderConfirmationPayload.mockRejectedValue(new Error('SMTP timeout'));

      const result = await service.dispatchDue();

      expect(repositoryMock.markFailed).not.toHaveBeenCalled();
      // attempts incremented 0 → 1; backoff = base * 2^(1-1) = 1000ms.
      expect(repositoryMock.markRetry).toHaveBeenCalledWith(
        'outbox-1',
        'SMTP timeout',
        new Date(NOW.getTime() + 1000),
        1,
      );
      expect(result).toEqual({ sent: 0, retried: 1, failed: 0 });
    });

    it('grows the backoff exponentially with the attempt count', async () => {
      // attempts already 2 → becomes 3; backoff = base * 2^(3-1) = 4000ms.
      repositoryMock.claimDue.mockResolvedValue([makeRow({ attempts: 2 })]);
      mailServiceMock.sendOrderConfirmationPayload.mockRejectedValue(new Error('boom'));

      await service.dispatchDue();

      expect(repositoryMock.markRetry).toHaveBeenCalledWith(
        'outbox-1',
        'boom',
        new Date(NOW.getTime() + 4000),
        3,
      );
    });

    it('caps the backoff at the configured maximum', async () => {
      // attempts 8 → 9; base * 2^8 = 256000ms, capped to MAX_MS (10000ms).
      repositoryMock.claimDue.mockResolvedValue([makeRow({ attempts: 8, maxAttempts: 20 })]);
      mailServiceMock.sendOrderConfirmationPayload.mockRejectedValue(new Error('still down'));

      await service.dispatchDue();

      expect(repositoryMock.markRetry).toHaveBeenCalledWith(
        'outbox-1',
        'still down',
        new Date(NOW.getTime() + MAX_MS),
        9,
      );
    });
  });

  // ─── dispatchDue — exhausted → FAILED ─────────────────────────────────────────

  describe('dispatchDue — exhausted → FAILED', () => {
    it('marks the row terminally FAILED once the incremented attempts reach maxAttempts', async () => {
      // attempts 4, max 5 → becomes 5 → terminal.
      repositoryMock.claimDue.mockResolvedValue([makeRow({ attempts: 4, maxAttempts: 5 })]);
      mailServiceMock.sendOrderConfirmationPayload.mockRejectedValue(new Error('permanent'));

      const result = await service.dispatchDue();

      expect(repositoryMock.markFailed).toHaveBeenCalledWith('outbox-1', 'permanent', 5);
      expect(repositoryMock.markRetry).not.toHaveBeenCalled();
      expect(result).toEqual({ sent: 0, retried: 0, failed: 1 });
    });
  });

  // ─── dispatchDue — disabled-mail no-op drain ──────────────────────────────────

  describe('dispatchDue — mail disabled', () => {
    it('drains due rows as no-op SENT outside production, without calling the transport', async () => {
      mailServiceMock.isEnabled.mockReturnValue(false);
      repositoryMock.claimDue.mockResolvedValue([makeRow({ id: 'a' }), makeRow({ id: 'b' })]);

      const result = await service.dispatchDue();

      expect(mailServiceMock.sendOrderConfirmationPayload).not.toHaveBeenCalled();
      expect(repositoryMock.markSent).toHaveBeenCalledWith('a', NOW);
      expect(repositoryMock.markSent).toHaveBeenCalledWith('b', NOW);
      expect(result).toEqual({ sent: 2, retried: 0, failed: 0 });
    });

    // The no-op drain is a dev convenience that becomes silent data loss in
    // production: rows marked SENT look delivered, so a misconfigured SMTP would
    // swallow every order confirmation with nothing anywhere reporting a failure.
    it('in production leaves rows PENDING instead of marking them SENT', async () => {
      const prodService = buildService('production');
      mailServiceMock.isEnabled.mockReturnValue(false);
      repositoryMock.claimDue.mockResolvedValue([makeRow({ id: 'a' }), makeRow({ id: 'b' })]);

      const result = await prodService.dispatchDue();

      expect(repositoryMock.markSent).not.toHaveBeenCalled();
      expect(mailServiceMock.sendOrderConfirmationPayload).not.toHaveBeenCalled();
      expect(result).toEqual({ sent: 0, retried: 0, failed: 0 });
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'mailOutbox.dispatch.blocked', pending: 2 }),
        expect.stringContaining('MAIL_ENABLED is false in production'),
      );
    });
  });

  // ─── dispatchDue — mixed batch & isolation ────────────────────────────────────

  describe('dispatchDue — mixed batch', () => {
    it('processes every row independently: one SENT, one retried', async () => {
      repositoryMock.claimDue.mockResolvedValue([
        makeRow({ id: 'ok' }),
        makeRow({ id: 'bad', attempts: 0 }),
      ]);
      mailServiceMock.sendOrderConfirmationPayload
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('flaky'));

      const result = await service.dispatchDue();

      expect(repositoryMock.markSent).toHaveBeenCalledWith('ok', NOW);
      expect(repositoryMock.markRetry).toHaveBeenCalledWith(
        'bad',
        'flaky',
        new Date(NOW.getTime() + 1000),
        1,
      );
      expect(result).toEqual({ sent: 1, retried: 1, failed: 0 });
    });

    it('treats an unknown payload type as a transient failure (rescheduled, not lost)', async () => {
      repositoryMock.claimDue.mockResolvedValue([makeRow({ type: 'unknown-type', attempts: 0 })]);

      const result = await service.dispatchDue();

      expect(mailServiceMock.sendOrderConfirmationPayload).not.toHaveBeenCalled();
      expect(repositoryMock.markRetry).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ sent: 0, retried: 1, failed: 0 });
    });
  });
});
