import { Prisma } from '@prisma/client';
import { DiscountRepository } from './discount.repository';
import { PrismaService } from '../prisma';

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const prismaMock = {
  $transaction: jest.fn(),
  discount: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  discountRedemption: {
    count: jest.fn(),
    create: jest.fn(),
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
        }),
      });
      expect(result).toBe(created);
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
  });

  describe('incrementRedeemed', () => {
    it('increments redeemedCount on the base client when no tx is given', async () => {
      prismaMock.discount.update.mockResolvedValue({ id: 'd1' });

      await repository.incrementRedeemed('d1');

      expect(prismaMock.discount.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { redeemedCount: { increment: 1 } },
      });
    });

    it('uses the provided transaction client when given', async () => {
      const tx = { discount: { update: jest.fn().mockResolvedValue({ id: 'd1' }) } };

      await repository.incrementRedeemed('d1', tx as unknown as Prisma.TransactionClient);

      expect(tx.discount.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { redeemedCount: { increment: 1 } },
      });
      expect(prismaMock.discount.update).not.toHaveBeenCalled();
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
});
