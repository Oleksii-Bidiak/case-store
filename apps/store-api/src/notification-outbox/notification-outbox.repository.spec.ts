import { NotificationOutboxStatus } from '@prisma/client';
import { NotificationOutboxRepository } from './notification-outbox.repository';
import { PrismaService } from '../prisma';

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const makeDelegate = () => ({
  create: jest.fn(),
  findMany: jest.fn(),
  findFirst: jest.fn(),
  update: jest.fn(),
});

const prismaMock = { notificationOutbox: makeDelegate() };

// A transaction client exposes the same `notificationOutbox` delegate.
const txMock = { notificationOutbox: makeDelegate() };

describe('NotificationOutboxRepository', () => {
  let repository: NotificationOutboxRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new NotificationOutboxRepository(prismaMock as unknown as PrismaService);
  });

  // ─── enqueue (tx-aware) ──────────────────────────────────────────────────────

  describe('enqueue', () => {
    it('creates a PENDING row on the base client when no tx is given', async () => {
      prismaMock.notificationOutbox.create.mockResolvedValue({ id: 'outbox-1' });

      await repository.enqueue({
        type: 'order-confirmation',
        recipientAddress: 'buyer@example.com',
        payload: { to: 'buyer@example.com' },
      });

      expect(prismaMock.notificationOutbox.create).toHaveBeenCalledWith({
        data: {
          type: 'order-confirmation',
          recipientAddress: 'buyer@example.com',
          payload: { to: 'buyer@example.com' },
        },
      });
      expect(txMock.notificationOutbox.create).not.toHaveBeenCalled();
    });

    it('writes through the provided transaction client so the row is atomic with the caller', async () => {
      txMock.notificationOutbox.create.mockResolvedValue({ id: 'outbox-2' });

      await repository.enqueue(
        { type: 'order-confirmation', recipientAddress: 'a@b.ua', payload: { x: 1 } },
        txMock as never,
      );

      // The row goes to the tx delegate, NOT the base prisma client.
      expect(txMock.notificationOutbox.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.notificationOutbox.create).not.toHaveBeenCalled();
    });

    it('forwards an explicit maxAttempts when supplied', async () => {
      prismaMock.notificationOutbox.create.mockResolvedValue({ id: 'outbox-3' });

      await repository.enqueue({
        type: 'order-confirmation',
        recipientAddress: 'a@b.ua',
        payload: {},
        maxAttempts: 3,
      });

      expect(prismaMock.notificationOutbox.create.mock.calls[0][0].data.maxAttempts).toBe(3);
    });

    it('omits maxAttempts (DB default applies) when not supplied', async () => {
      prismaMock.notificationOutbox.create.mockResolvedValue({ id: 'outbox-4' });

      await repository.enqueue({
        type: 'order-confirmation',
        recipientAddress: 'a@b.ua',
        payload: {},
      });

      expect(prismaMock.notificationOutbox.create.mock.calls[0][0].data).not.toHaveProperty(
        'maxAttempts',
      );
    });
  });

  // ─── claimDue (due-filter + ordering) ────────────────────────────────────────

  describe('claimDue', () => {
    it('selects PENDING rows due at/before now, oldest first, limited to the batch size', async () => {
      prismaMock.notificationOutbox.findMany.mockResolvedValue([]);
      const now = new Date('2026-06-30T12:00:00.000Z');

      await repository.claimDue(now, 20);

      expect(prismaMock.notificationOutbox.findMany).toHaveBeenCalledWith({
        where: { status: NotificationOutboxStatus.PENDING, nextAttemptAt: { lte: now } },
        orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
        take: 20,
      });
    });
  });

  // ─── status transitions ──────────────────────────────────────────────────────

  describe('markSent', () => {
    it('flips the row to SENT, stamps sentAt, and clears the last error', async () => {
      prismaMock.notificationOutbox.update.mockResolvedValue({ id: 'outbox-1' });
      const sentAt = new Date('2026-06-30T12:00:00.000Z');

      await repository.markSent('outbox-1', sentAt);

      expect(prismaMock.notificationOutbox.update).toHaveBeenCalledWith({
        where: { id: 'outbox-1' },
        data: { status: NotificationOutboxStatus.SENT, sentAt, lastError: null },
      });
    });
  });

  describe('markRetry', () => {
    it('keeps the row PENDING and records attempts, error and the next attempt time', async () => {
      prismaMock.notificationOutbox.update.mockResolvedValue({ id: 'outbox-1' });
      const nextAttemptAt = new Date('2026-06-30T12:05:00.000Z');

      await repository.markRetry('outbox-1', 'SMTP timeout', nextAttemptAt, 2);

      expect(prismaMock.notificationOutbox.update).toHaveBeenCalledWith({
        where: { id: 'outbox-1' },
        data: {
          status: NotificationOutboxStatus.PENDING,
          attempts: 2,
          lastError: 'SMTP timeout',
          nextAttemptAt,
        },
      });
    });
  });

  describe('markFailed', () => {
    it('flips the row to terminal FAILED and records attempts + last error', async () => {
      prismaMock.notificationOutbox.update.mockResolvedValue({ id: 'outbox-1' });

      await repository.markFailed('outbox-1', 'permanent bounce', 5);

      expect(prismaMock.notificationOutbox.update).toHaveBeenCalledWith({
        where: { id: 'outbox-1' },
        data: {
          status: NotificationOutboxStatus.FAILED,
          attempts: 5,
          lastError: 'permanent bounce',
        },
      });
    });
  });

  // ─── hasRecentByTypeAndRecipient (rate-limit ledger, TASK-287) ───────────────

  describe('hasRecentByTypeAndRecipient', () => {
    const since = new Date('2026-07-10T12:00:00.000Z');

    it('matches on type + recipient + createdAt >= since, regardless of status', async () => {
      prismaMock.notificationOutbox.findFirst.mockResolvedValue({ id: 'outbox-9' });

      await expect(
        repository.hasRecentByTypeAndRecipient('account-locked', 'banned@example.com', since),
      ).resolves.toBe(true);

      // Status is deliberately NOT part of the filter: a still-PENDING or even
      // FAILED row still means "we already decided to mail this address".
      expect(prismaMock.notificationOutbox.findFirst).toHaveBeenCalledWith({
        where: {
          type: 'account-locked',
          recipientAddress: 'banned@example.com',
          createdAt: { gte: since },
        },
        select: { id: true },
      });
    });

    it('returns false when no row exists inside the window', async () => {
      prismaMock.notificationOutbox.findFirst.mockResolvedValue(null);

      await expect(
        repository.hasRecentByTypeAndRecipient('account-locked', 'banned@example.com', since),
      ).resolves.toBe(false);
    });
  });
});
