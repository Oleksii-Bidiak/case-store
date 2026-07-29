import { UserRepository } from './user.repository';
import { PrismaService } from '../prisma';

// ─── Mock PrismaService ──────────────────────────────────────────────────────

const prismaMock = {
  user: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  order: {
    aggregate: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
  },
  review: {
    findMany: jest.fn(),
  },
  discountRedemption: {
    findMany: jest.fn(),
  },
  contactMessage: {
    findMany: jest.fn(),
  },
};

describe('UserRepository (soft-delete behaviour)', () => {
  let repository: UserRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new UserRepository(prismaMock as unknown as PrismaService);
  });

  describe('findById', () => {
    it('should exclude soft-deleted users via deletedAt: null', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);

      await repository.findById('user-1');

      expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'user-1', deletedAt: null },
      });
    });
  });

  describe('findByEmail', () => {
    it('should exclude soft-deleted users', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);

      await repository.findByEmail('user@example.com');

      expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
        where: { email: 'user@example.com', deletedAt: null },
      });
    });
  });

  describe('findAll', () => {
    it('should always constrain the where clause with deletedAt: null', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20 });

      const findManyArgs = prismaMock.user.findMany.mock.calls[0][0];
      expect(findManyArgs.where).toEqual(expect.objectContaining({ deletedAt: null }));
      const countArgs = prismaMock.user.count.mock.calls[0][0];
      expect(countArgs.where).toEqual(expect.objectContaining({ deletedAt: null }));
    });

    it('defaults to createdAt desc when no sort is provided (TASK-147)', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20 });

      expect(prismaMock.user.findMany.mock.calls[0][0].orderBy).toEqual([
        { createdAt: 'desc' },
        { id: 'asc' },
      ]);
    });

    it('sorts by an allow-listed field + order (TASK-147)', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);

      await repository.findAll({
        page: 1,
        limit: 20,
        sortBy: 'email',
        sortOrder: 'asc',
      });

      expect(prismaMock.user.findMany.mock.calls[0][0].orderBy).toEqual([
        { email: 'asc' },
        { id: 'asc' },
      ]);
    });

    it('appends id so a paginated sort cannot repeat or skip an account (TASK-356)', async () => {
      // The default sort is `createdAt`, which is not unique: a seed batch or a
      // bulk import stamps many accounts with one timestamp. Without a total
      // order, a page boundary inside a tie group is arbitrary per query, and
      // the same account can come back on page 1 and page 2 while another never
      // appears — with the totals still adding up, so nothing looks wrong.
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);

      await repository.findAll({ page: 3, limit: 20, sortBy: 'createdAt', sortOrder: 'asc' });

      const { orderBy } = prismaMock.user.findMany.mock.calls[0][0];
      expect(orderBy[orderBy.length - 1]).toEqual({ id: 'asc' });
    });

    it('falls back to createdAt for an unknown sort field (TASK-147)', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);

      await repository.findAll({
        page: 1,
        limit: 20,
        sortBy: "name'; DROP TABLE users;--",
        sortOrder: 'asc',
      });

      expect(prismaMock.user.findMany.mock.calls[0][0].orderBy).toEqual([
        { createdAt: 'asc' },
        { id: 'asc' },
      ]);
    });

    // ── isActive filter (TASK-150 B5) ──
    it('constrains where.isActive to true when isActive: true', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20, isActive: true });

      expect(prismaMock.user.findMany.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ isActive: true, deletedAt: null }),
      );
      expect(prismaMock.user.count.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ isActive: true }),
      );
    });

    it('constrains where.isActive to false when isActive: false', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20, isActive: false });

      expect(prismaMock.user.findMany.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ isActive: false, deletedAt: null }),
      );
    });

    it('omits where.isActive entirely when isActive is undefined (all statuses)', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20 });

      expect(prismaMock.user.findMany.mock.calls[0][0].where).not.toHaveProperty('isActive');
    });
  });

  describe('softDelete', () => {
    it('should stamp deletedAt, disable the user, mangle email, and store originalEmail', async () => {
      prismaMock.user.update.mockResolvedValue({ id: 'user-1' });

      await repository.softDelete('user-1', 'deleted:user-1:user@example.com', 'user@example.com');

      const updateArgs = prismaMock.user.update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ id: 'user-1' });
      expect(updateArgs.data.isActive).toBe(false);
      expect(updateArgs.data.email).toBe('deleted:user-1:user@example.com');
      expect(updateArgs.data.originalEmail).toBe('user@example.com');
      expect(updateArgs.data.deletedAt).toBeInstanceOf(Date);
    });
  });

  // ─── Admin customer card reads (TASK-252) ──────────────────────────────────

  describe('getLtv', () => {
    it('sums PAID order totals with NO deletedAt filter (mirrors dashboard revenue)', async () => {
      prismaMock.order.aggregate.mockResolvedValue({ _sum: { total: 1299.5 } });

      const ltv = await repository.getLtv('user-1');

      expect(ltv).toBe(1299.5);
      expect(prismaMock.order.aggregate).toHaveBeenCalledWith({
        _sum: { total: true },
        where: { userId: 'user-1', paymentStatus: 'PAID' },
      });
      // The asymmetry guard: LTV must NOT constrain on deletedAt.
      const whereArg = prismaMock.order.aggregate.mock.calls[0][0].where;
      expect(whereArg).not.toHaveProperty('deletedAt');
    });

    it('falls back to Number(0) when _sum.total is null (no PAID orders)', async () => {
      prismaMock.order.aggregate.mockResolvedValue({ _sum: { total: null } });

      const ltv = await repository.getLtv('user-1');

      expect(ltv).toBe(0);
    });
  });

  describe('getOrderCount', () => {
    it('counts only live (deletedAt: null) orders for the user', async () => {
      prismaMock.order.count.mockResolvedValue(12);

      const count = await repository.getOrderCount('user-1');

      expect(count).toBe(12);
      expect(prismaMock.order.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', deletedAt: null },
      });
    });
  });

  describe('getRecentOrders', () => {
    it('selects live orders newest-first, capped, with the card column set', async () => {
      prismaMock.order.findMany.mockResolvedValue([]);

      await repository.getRecentOrders('user-1', 10);

      expect(prismaMock.order.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          total: true,
          createdAt: true,
        },
      });
    });
  });

  describe('getReviewsByUserId', () => {
    it('joins the product name and flattens to AdminCardReviewRow', async () => {
      prismaMock.review.findMany.mockResolvedValue([
        {
          id: 'review-1',
          productId: 'prod-1',
          rating: 5,
          comment: 'Great!',
          isActive: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          product: { name: 'iPhone 15 Pro Case' },
        },
      ]);

      const rows = await repository.getReviewsByUserId('user-1', 20);

      expect(prismaMock.review.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { product: { select: { name: true } } },
      });
      expect(rows).toEqual([
        {
          id: 'review-1',
          productId: 'prod-1',
          productName: 'iPhone 15 Pro Case',
          rating: 5,
          comment: 'Great!',
          isActive: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
    });
  });

  describe('getRedeemedCoupons', () => {
    it('joins discount code/type/value and flattens to AdminCardCouponRow', async () => {
      prismaMock.discountRedemption.findMany.mockResolvedValue([
        {
          id: 'redemption-1',
          orderId: 'order-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          discount: { code: 'SUMMER20', type: 'PERCENT', value: 20 },
        },
      ]);

      const rows = await repository.getRedeemedCoupons('user-1', 20);

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
          value: 20,
          orderId: 'order-1',
          redeemedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
    });
  });

  describe('getContactMessagesByEmail', () => {
    it('matches by exact email string, newest-first, capped', async () => {
      prismaMock.contactMessage.findMany.mockResolvedValue([]);

      await repository.getContactMessagesByEmail('user@example.com', 20);

      expect(prismaMock.contactMessage.findMany).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
    });
  });
});
