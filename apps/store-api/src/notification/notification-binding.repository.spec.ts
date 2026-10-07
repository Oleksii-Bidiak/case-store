import { NotificationAudience, NotificationChannel } from '@prisma/client';
import type { PrismaService } from '../prisma';
import { NotificationBindingRepository } from './notification-binding.repository';

/**
 * The query SHAPES of the customer paths (TASK-679, TASK-1091). What the
 * database then does with them — the three partial unique indexes, the race —
 * is proved on real Postgres by `test/notification-binding.int-spec.ts`; this
 * file pins the filters that keep one customer away from another's chats.
 */
const NOW = new Date('2026-10-07T12:00:00.000Z');
const TELEGRAM = NotificationChannel.TELEGRAM;
const CUSTOMER = NotificationAudience.CUSTOMER;

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'b-1',
    channel: TELEGRAM,
    audience: CUSTOMER,
    externalId: '777',
    label: '@olena',
    userId: null,
    orderId: 'order-a',
    createdAt: new Date('2026-10-07T10:00:00.000Z'),
    revokedAt: null,
    ...over,
  };
}

describe('NotificationBindingRepository', () => {
  const tx = {
    notificationBindingToken: { updateMany: jest.fn(), findUnique: jest.fn() },
    notificationBinding: { createMany: jest.fn(), findFirst: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    notificationBinding: { findMany: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn() },
  };
  const repository = new NotificationBindingRepository(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('consumeToken — which row it reads back', () => {
    function token(over: Record<string, unknown>) {
      return {
        tokenHash: 'h',
        channel: TELEGRAM,
        consumedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 60_000),
        userId: null,
        orderId: null,
        ...over,
      };
    }

    beforeEach(() => {
      tx.notificationBindingToken.updateMany.mockResolvedValue({ count: 1 });
      tx.notificationBinding.createMany.mockResolvedValue({ count: 1 });
      tx.notificationBinding.findFirst.mockResolvedValue(row());
    });

    it('CUSTOMER: the chat AND the token owner — order B never reads back order A', async () => {
      tx.notificationBindingToken.findUnique.mockResolvedValue(
        token({ audience: CUSTOMER, orderId: 'order-b' }),
      );

      await repository.consumeToken('h', { externalId: '777', isPrivate: true }, NOW);

      expect(tx.notificationBinding.findFirst).toHaveBeenCalledWith({
        where: {
          channel: TELEGRAM,
          audience: CUSTOMER,
          externalId: '777',
          revokedAt: null,
          userId: null,
          orderId: 'order-b',
        },
      });
    });

    it('CUSTOMER account token: keyed by the account', async () => {
      tx.notificationBindingToken.findUnique.mockResolvedValue(
        token({ audience: CUSTOMER, userId: 'user-1' }),
      );

      await repository.consumeToken('h', { externalId: '777', isPrivate: true }, NOW);

      expect(tx.notificationBinding.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({ userId: 'user-1', orderId: null }),
      });
    });

    it('SHOP: unchanged — one row per chat, whoever connected it', async () => {
      tx.notificationBindingToken.findUnique.mockResolvedValue(
        token({ audience: NotificationAudience.SHOP, userId: 'admin-1' }),
      );
      tx.notificationBinding.findFirst.mockResolvedValue(
        row({ audience: NotificationAudience.SHOP }),
      );

      await repository.consumeToken('h', { externalId: '777', isPrivate: true }, NOW);

      expect(tx.notificationBinding.findFirst).toHaveBeenCalledWith({
        where: {
          channel: TELEGRAM,
          audience: NotificationAudience.SHOP,
          externalId: '777',
          revokedAt: null,
        },
      });
    });

    it('CUSTOMER token from a group: refused as private-only, spent, binds nothing', async () => {
      tx.notificationBindingToken.findUnique.mockResolvedValue(
        token({ audience: CUSTOMER, orderId: 'order-a' }),
      );

      await expect(
        repository.consumeToken('h', { externalId: '-100500', isPrivate: false }, NOW),
      ).resolves.toEqual({ ok: false, reason: 'private-only' });

      // Spent by the same conditional update as any exchange: a link posted in a
      // group is seen by every member.
      expect(tx.notificationBindingToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: 'h', consumedAt: null, expiresAt: { gt: NOW } },
        data: { consumedAt: NOW },
      });
      expect(tx.notificationBinding.createMany).not.toHaveBeenCalled();
    });

    it('SHOP token from a group still binds — a shop chat may be a group', async () => {
      tx.notificationBindingToken.findUnique.mockResolvedValue(
        token({ audience: NotificationAudience.SHOP, userId: 'admin-1' }),
      );
      tx.notificationBinding.findFirst.mockResolvedValue(
        row({ audience: NotificationAudience.SHOP, externalId: '-100500' }),
      );

      await expect(
        repository.consumeToken('h', { externalId: '-100500', isPrivate: false }, NOW),
      ).resolves.toMatchObject({ ok: true });
      expect(tx.notificationBinding.createMany).toHaveBeenCalled();
    });

    it('a spent CUSTOMER token from a group is plain invalid, not private-only', async () => {
      tx.notificationBindingToken.updateMany.mockResolvedValue({ count: 0 });
      tx.notificationBindingToken.findUnique.mockResolvedValue(
        token({ audience: CUSTOMER, orderId: 'order-a' }),
      );

      await expect(
        repository.consumeToken('h', { externalId: '-100500', isPrivate: false }, NOW),
      ).resolves.toEqual({ ok: false, reason: 'invalid' });
    });
  });

  describe('hasActive — the send gate (audience and owner, not just the chat)', () => {
    beforeEach(() => {
      prisma.notificationBinding.findFirst.mockResolvedValue({ id: 'b-1' });
    });

    it('SHOP: an active SHOP row of the chat, nothing else', async () => {
      await expect(
        repository.hasActive(TELEGRAM, '777', { audience: NotificationAudience.SHOP }),
      ).resolves.toBe(true);

      expect(prisma.notificationBinding.findFirst).toHaveBeenCalledWith({
        where: {
          channel: TELEGRAM,
          externalId: '777',
          audience: NotificationAudience.SHOP,
          revokedAt: null,
        },
        select: { id: true },
      });
    });

    it('CUSTOMER: an active CUSTOMER row of the chat AND of the owner', async () => {
      await repository.hasActive(TELEGRAM, '777', {
        audience: CUSTOMER,
        owner: { userId: 'user-1', orderId: 'order-a' },
      });

      expect(prisma.notificationBinding.findFirst).toHaveBeenCalledWith({
        where: {
          channel: TELEGRAM,
          externalId: '777',
          audience: CUSTOMER,
          revokedAt: null,
          OR: [
            { userId: 'user-1' },
            { order: { is: { userId: 'user-1' } } },
            { orderId: 'order-a' },
          ],
        },
        select: { id: true },
      });
    });

    it('CUSTOMER with no owner: false, and the database is not asked', async () => {
      await expect(
        repository.hasActive(TELEGRAM, '777', { audience: CUSTOMER, owner: {} }),
      ).resolves.toBe(false);
      expect(prisma.notificationBinding.findFirst).not.toHaveBeenCalled();
    });

    it('no matching row: false', async () => {
      prisma.notificationBinding.findFirst.mockResolvedValue(null);

      await expect(
        repository.hasActive(TELEGRAM, '777', { audience: NotificationAudience.SHOP }),
      ).resolves.toBe(false);
    });
  });

  describe('findActiveForCustomer', () => {
    it('an owner with neither id matches nothing and asks nothing', async () => {
      await expect(repository.findActiveForCustomer(TELEGRAM, {})).resolves.toEqual([]);
      await expect(
        repository.findActiveForCustomer(TELEGRAM, { userId: null, orderId: '' }),
      ).resolves.toEqual([]);
      expect(prisma.notificationBinding.findMany).not.toHaveBeenCalled();
    });

    it('CUSTOMER only, active only, the union of the given owners', async () => {
      prisma.notificationBinding.findMany.mockResolvedValue([]);

      await repository.findActiveForCustomer(TELEGRAM, { userId: 'user-1', orderId: 'order-a' });

      expect(prisma.notificationBinding.findMany).toHaveBeenCalledWith({
        where: {
          channel: TELEGRAM,
          audience: CUSTOMER,
          revokedAt: null,
          OR: [
            { userId: 'user-1' },
            { order: { is: { userId: 'user-1' } } },
            { orderId: 'order-a' },
          ],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
    });

    it('one chat bound to the account and the order is ONE recipient (the oldest row)', async () => {
      prisma.notificationBinding.findMany.mockResolvedValue([
        row({ id: 'by-order', orderId: 'order-a' }),
        row({ id: 'by-account', userId: 'user-1', orderId: null }),
        row({ id: 'other-chat', externalId: '888' }),
      ]);

      const found = await repository.findActiveForCustomer(TELEGRAM, {
        userId: 'user-1',
        orderId: 'order-a',
      });

      expect(found.map((b) => b.id)).toEqual(['by-order', 'other-chat']);
    });

    it('uses the transaction client when given one', async () => {
      const txClient = { notificationBinding: { findMany: jest.fn().mockResolvedValue([]) } };

      await repository.findActiveForCustomer(TELEGRAM, { orderId: 'order-a' }, txClient as never);

      expect(txClient.notificationBinding.findMany).toHaveBeenCalled();
      expect(prisma.notificationBinding.findMany).not.toHaveBeenCalled();
    });
  });

  describe('revokeForCustomer', () => {
    it('reaches only CUSTOMER rows of the proven owner', async () => {
      prisma.notificationBinding.updateMany.mockResolvedValue({ count: 2 });

      await expect(repository.revokeForCustomer(TELEGRAM, { userId: 'user-1' }, NOW)).resolves.toBe(
        2,
      );

      expect(prisma.notificationBinding.updateMany).toHaveBeenCalledWith({
        where: {
          channel: TELEGRAM,
          audience: CUSTOMER,
          revokedAt: null,
          OR: [{ userId: 'user-1' }, { order: { is: { userId: 'user-1' } } }],
        },
        data: { revokedAt: NOW },
      });
    });

    it('an empty owner revokes nothing — never a `userId: null` sweep', async () => {
      await expect(repository.revokeForCustomer(TELEGRAM, { userId: '' }, NOW)).resolves.toBe(0);
      expect(prisma.notificationBinding.updateMany).not.toHaveBeenCalled();
    });
  });
});
