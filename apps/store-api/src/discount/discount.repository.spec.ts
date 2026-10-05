import { Prisma } from '@prisma/client';
import { DiscountRepository } from './discount.repository';
import { PrismaService } from '../prisma';

// ─── Prisma mock ──────────────────────────────────────────────────────────────

/** Stand-in for Prisma's field-reference token (`prisma.discount.fields.maxRedemptions`). */
const MAX_REDEMPTIONS_FIELD_REF = { name: 'maxRedemptions' };

const prismaMock = {
  $transaction: jest.fn(),
  discount: {
    fields: { maxRedemptions: MAX_REDEMPTIONS_FIELD_REF },
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  discountRedemption: {
    count: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
  },
};

describe('DiscountRepository', () => {
  let repository: DiscountRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new DiscountRepository(prismaMock as unknown as PrismaService);
  });

  describe('findByCode', () => {
    it('looks up a discount by its unique code', async () => {
      const discount = { id: 'd1', code: 'SUMMER10' };
      prismaMock.discount.findUnique.mockResolvedValue(discount);

      const result = await repository.findByCode('SUMMER10');

      expect(prismaMock.discount.findUnique).toHaveBeenCalledWith({ where: { code: 'SUMMER10' } });
      expect(result).toBe(discount);
    });
  });

  describe('findById', () => {
    it('looks up a discount by id', async () => {
      prismaMock.discount.findUnique.mockResolvedValue(null);

      const result = await repository.findById('missing');

      expect(prismaMock.discount.findUnique).toHaveBeenCalledWith({ where: { id: 'missing' } });
      expect(result).toBeNull();
    });

    it('reads through the provided transaction client when given', async () => {
      const tx = { discount: { findUnique: jest.fn().mockResolvedValue({ id: 'd1' }) } };

      const result = await repository.findById('d1', tx as unknown as Prisma.TransactionClient);

      expect(tx.discount.findUnique).toHaveBeenCalledWith({ where: { id: 'd1' } });
      expect(prismaMock.discount.findUnique).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'd1' });
    });
  });

  describe('findMany', () => {
    it('applies pagination, active filter, and code search inside one transaction', async () => {
      prismaMock.$transaction.mockResolvedValue([[{ id: 'd1' }], 1]);

      const result = await repository.findMany({
        page: 2,
        limit: 10,
        isActive: true,
        search: 'SUM',
        sortBy: 'redeemedCount',
        sortOrder: 'asc',
      });

      expect(prismaMock.discount.findMany).toHaveBeenCalledWith({
        where: { isActive: true, code: { contains: 'SUM', mode: 'insensitive' } },
        skip: 10,
        take: 10,
        orderBy: { redeemedCount: 'asc' },
      });
      expect(result).toEqual({ discounts: [{ id: 'd1' }], total: 1 });
    });

    it('falls back to createdAt for an unknown sort field', async () => {
      prismaMock.$transaction.mockResolvedValue([[], 0]);

      await repository.findMany({ page: 1, limit: 20, sortBy: 'evil' });

      expect(prismaMock.discount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });
  });

  describe('findActiveWindowCandidates', () => {
    it('queries active codes within the start/expiry window, ordered by expiry', async () => {
      const now = new Date('2026-07-08T00:00:00.000Z');
      prismaMock.discount.findMany.mockResolvedValue([{ id: 'd1' }]);

      const result = await repository.findActiveWindowCandidates(now);

      expect(prismaMock.discount.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          // TASK-731: only codes the operator published reach the public feed.
          showOnPromoPage: true,
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
          AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
        },
        orderBy: { expiresAt: 'asc' },
      });
      expect(result).toEqual([{ id: 'd1' }]);
    });
  });

  describe('create', () => {
    it('persists a discount with normalized null defaults', async () => {
      const created = { id: 'd1' };
      prismaMock.discount.create.mockResolvedValue(created);

      const result = await repository.create({
        code: 'SUMMER10',
        type: 'PERCENT',
        value: new Prisma.Decimal('10'),
      });

      expect(prismaMock.discount.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          code: 'SUMMER10',
          type: 'PERCENT',
          minSpend: null,
          maxRedemptions: null,
          perUserLimit: null,
          startsAt: null,
          expiresAt: null,
          isActive: true,
          // TASK-731: a new code is private until the operator publishes it.
          showOnPromoPage: false,
        }),
      });
      expect(result).toBe(created);
    });

    it('persists showOnPromoPage when the operator publishes on create (TASK-731)', async () => {
      prismaMock.discount.create.mockResolvedValue({ id: 'd1' });

      await repository.create({
        code: 'PUBLIC5',
        type: 'PERCENT',
        value: new Prisma.Decimal('5'),
        showOnPromoPage: true,
      });

      expect(prismaMock.discount.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ showOnPromoPage: true }),
      });
    });
  });

  describe('softDeactivate', () => {
    it('sets isActive to false', async () => {
      prismaMock.discount.update.mockResolvedValue({ id: 'd1', isActive: false });

      await repository.softDeactivate('d1');

      expect(prismaMock.discount.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { isActive: false },
      });
    });
  });

  describe('countUserRedemptions', () => {
    it('counts redemptions scoped to discount and user', async () => {
      prismaMock.discountRedemption.count.mockResolvedValue(2);

      const result = await repository.countUserRedemptions('d1', 'u1');

      expect(prismaMock.discountRedemption.count).toHaveBeenCalledWith({
        where: { discountId: 'd1', userId: 'u1' },
      });
      expect(result).toBe(2);
    });

    it('counts through the provided transaction client when given', async () => {
      const tx = { discountRedemption: { count: jest.fn().mockResolvedValue(1) } };

      const result = await repository.countUserRedemptions(
        'd1',
        'u1',
        tx as unknown as Prisma.TransactionClient,
      );

      expect(tx.discountRedemption.count).toHaveBeenCalledWith({
        where: { discountId: 'd1', userId: 'u1' },
      });
      expect(prismaMock.discountRedemption.count).not.toHaveBeenCalled();
      expect(result).toBe(1);
    });
  });

  describe('tryIncrementRedeemed', () => {
    // The cap check must live INSIDE the UPDATE's WHERE (column-vs-column), not
    // in a preceding read — that is what makes the global cap race-proof.
    const expectedCall = {
      where: {
        id: 'd1',
        OR: [{ maxRedemptions: null }, { redeemedCount: { lt: MAX_REDEMPTIONS_FIELD_REF } }],
      },
      data: { redeemedCount: { increment: 1 } },
    };

    it('claims a slot with a conditional updateMany and returns the row count', async () => {
      prismaMock.discount.updateMany.mockResolvedValue({ count: 1 });

      const result = await repository.tryIncrementRedeemed('d1');

      expect(prismaMock.discount.updateMany).toHaveBeenCalledWith(expectedCall);
      expect(result).toBe(1);
    });

    it('returns 0 when the cap is exhausted (no row matched the predicate)', async () => {
      prismaMock.discount.updateMany.mockResolvedValue({ count: 0 });

      expect(await repository.tryIncrementRedeemed('d1')).toBe(0);
    });

    it('uses the provided transaction client when given', async () => {
      const tx = { discount: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };

      await repository.tryIncrementRedeemed('d1', tx as unknown as Prisma.TransactionClient);

      expect(tx.discount.updateMany).toHaveBeenCalledWith(expectedCall);
      expect(prismaMock.discount.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('createRedemption', () => {
    it('inserts a redemption row via the transaction client', async () => {
      const tx = { discountRedemption: { create: jest.fn().mockResolvedValue({ id: 'r1' }) } };

      await repository.createRedemption(
        { discountId: 'd1', userId: 'u1', orderId: 'o1' },
        tx as unknown as Prisma.TransactionClient,
      );

      expect(tx.discountRedemption.create).toHaveBeenCalledWith({
        data: { discountId: 'd1', userId: 'u1', orderId: 'o1' },
      });
    });
  });

  // TASK-827: moved here from `UserRepository.getRedeemedCoupons` — the admin
  // customer card reads it through `DiscountService.listUserRedemptions`.
  describe('findRedemptionsByUser', () => {
    it('joins discount code/type/value, newest first, capped, and flattens the row', async () => {
      const value = new Prisma.Decimal('20.00');
      prismaMock.discountRedemption.findMany.mockResolvedValue([
        {
          id: 'redemption-1',
          orderId: 'order-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          discount: { code: 'SUMMER20', type: 'PERCENT', value },
        },
      ]);

      const rows = await repository.findRedemptionsByUser('user-1', 20);

      expect(prismaMock.discountRedemption.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { discount: { select: { code: true, type: true, value: true } } },
      });
      expect(rows).toEqual([
        {
          id: 'redemption-1',
          code: 'SUMMER20',
          type: 'PERCENT',
          value,
          orderId: 'order-1',
          redeemedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      // The Decimal is handed through untouched — the card's entity converts it.
      expect(rows[0].value).toBe(value);
    });
  });
});
