import { Test, TestingModule } from '@nestjs/testing';
import { NewsletterStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import { NewsletterRepository } from './newsletter.repository';

const mockRow = {
  id: 'sub-uuid-1',
  email: 'user@example.com',
  status: NewsletterStatus.SUBSCRIBED,
  source: 'home',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  unsubscribedAt: null,
};

const prismaMock = {
  newsletterSubscription: {
    upsert: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

describe('NewsletterRepository', () => {
  let repository: NewsletterRepository;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [NewsletterRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    repository = module.get<NewsletterRepository>(NewsletterRepository);
  });

  describe('subscribe (idempotent upsert)', () => {
    it('upserts by unique email — creates SUBSCRIBED, re-activates on conflict, no duplicate', async () => {
      prismaMock.newsletterSubscription.upsert.mockResolvedValue(mockRow);

      const result = await repository.subscribe('user@example.com', 'home');

      expect(result).toEqual(mockRow);
      expect(prismaMock.newsletterSubscription.upsert).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
        create: {
          email: 'user@example.com',
          status: NewsletterStatus.SUBSCRIBED,
          source: 'home',
        },
        update: {
          status: NewsletterStatus.SUBSCRIBED,
          unsubscribedAt: null,
          source: 'home',
        },
      });
    });

    it('does not overwrite source on re-subscribe when none is supplied', async () => {
      prismaMock.newsletterSubscription.upsert.mockResolvedValue(mockRow);

      await repository.subscribe('user@example.com');

      const arg = prismaMock.newsletterSubscription.upsert.mock.calls[0][0];
      expect(arg.update).not.toHaveProperty('source');
      expect(arg.create.source).toBeNull();
    });
  });

  describe('unsubscribe', () => {
    it('stamps unsubscribedAt + UNSUBSCRIBED when the email exists', async () => {
      const now = new Date('2026-02-01T00:00:00.000Z');
      prismaMock.newsletterSubscription.findUnique.mockResolvedValue(mockRow);
      prismaMock.newsletterSubscription.update.mockResolvedValue({
        ...mockRow,
        status: NewsletterStatus.UNSUBSCRIBED,
        unsubscribedAt: now,
      });

      const result = await repository.unsubscribe('user@example.com', now);

      expect(result?.status).toBe(NewsletterStatus.UNSUBSCRIBED);
      expect(prismaMock.newsletterSubscription.update).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
        data: { status: NewsletterStatus.UNSUBSCRIBED, unsubscribedAt: now },
      });
    });

    it('returns null (no update) for an unknown email', async () => {
      prismaMock.newsletterSubscription.findUnique.mockResolvedValue(null);

      const result = await repository.unsubscribe('ghost@example.com');

      expect(result).toBeNull();
      expect(prismaMock.newsletterSubscription.update).not.toHaveBeenCalled();
    });
  });

  describe('findAll (list / filter / pagination)', () => {
    it('applies status filter, email search, and pagination skip/take', async () => {
      prismaMock.newsletterSubscription.findMany.mockResolvedValue([mockRow]);
      prismaMock.newsletterSubscription.count.mockResolvedValue(1);

      const result = await repository.findAll({
        page: 2,
        limit: 10,
        status: NewsletterStatus.SUBSCRIBED,
        search: 'user',
      });

      expect(result).toEqual({ subscriptions: [mockRow], total: 1 });
      expect(prismaMock.newsletterSubscription.findMany).toHaveBeenCalledWith({
        where: {
          status: NewsletterStatus.SUBSCRIBED,
          email: { contains: 'user', mode: 'insensitive' },
        },
        skip: 10,
        take: 10,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      });
    });

    it('omits status/search from the where clause when not provided', async () => {
      prismaMock.newsletterSubscription.findMany.mockResolvedValue([]);
      prismaMock.newsletterSubscription.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20 });

      expect(prismaMock.newsletterSubscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {}, skip: 0, take: 20 }),
      );
    });
  });

  describe('findAll — sorting (TASK-356)', () => {
    beforeEach(() => {
      prismaMock.newsletterSubscription.findMany.mockResolvedValue([]);
      prismaMock.newsletterSubscription.count.mockResolvedValue(0);
    });

    const orderByOf = () =>
      prismaMock.newsletterSubscription.findMany.mock.calls[0][0].orderBy as Record<
        string,
        string
      >[];

    it.each(['createdAt', 'email', 'status'] as const)(
      'reaches Prisma with %s as the leading orderBy key',
      async (sortBy) => {
        await repository.findAll({ page: 1, limit: 20, sortBy, sortOrder: 'asc' });

        expect(orderByOf()[0]).toEqual({ [sortBy]: 'asc' });
      },
    );

    it('falls back to createdAt desc for a field outside the allow-list', async () => {
      // The DTO already rejects this at the HTTP boundary; the fallback exists
      // for every other caller, because a raw sortBy string handed to Prisma is
      // a query-shape injection.
      await repository.findAll({ page: 1, limit: 20, sortBy: 'passwordHash' });

      expect(orderByOf()[0]).toEqual({ createdAt: 'desc' });
    });

    it('always ends with a unique tiebreaker so paging cannot repeat or skip rows', async () => {
      // `status` has two values: without the tiebreaker a page boundary inside a
      // tie group is ordered arbitrarily, and the same subscriber can appear on
      // two pages while another appears on none.
      await repository.findAll({ page: 1, limit: 20, sortBy: 'status', sortOrder: 'asc' });

      expect(orderByOf()).toEqual([{ status: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }]);
    });
  });

  describe('findAllForExport', () => {
    it('returns every matching row without pagination, newest first', async () => {
      prismaMock.newsletterSubscription.findMany.mockResolvedValue([mockRow]);

      const result = await repository.findAllForExport({ status: NewsletterStatus.SUBSCRIBED });

      expect(result).toEqual([mockRow]);
      expect(prismaMock.newsletterSubscription.findMany).toHaveBeenCalledWith({
        where: { status: NewsletterStatus.SUBSCRIBED },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
