import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma';
import { FaqRepository } from './faq.repository';
import { ReorderStaleError } from '../common/reorder';

const mockFaq = {
  id: 'faq-uuid-1',
  question: 'Скільки коштує доставка?',
  answer: 'Безкоштовно від 1 000 ₴.',
  sortOrder: 0,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

/**
 * ONE delegate shared by the singleton client and the transaction client: the repository
 * reads/writes through `tx.faqItem` inside a transaction (create + reorder) and through
 * `this.prisma.faqItem` outside one, and the assertions do not care which.
 */
const faqDelegate = {
  findUnique: jest.fn(),
  findMany: jest.fn(),
  count: jest.fn(),
  aggregate: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
  delete: jest.fn(),
};

const txMock = {
  faqItem: faqDelegate,
  // `pg_advisory_xact_lock` — taken by `create` and by `reorderAll`.
  $executeRaw: jest.fn(),
};

const prismaMock = {
  faqItem: faqDelegate,
  $transaction: jest.fn((cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
};

describe('FaqRepository', () => {
  let repository: FaqRepository;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [FaqRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    repository = module.get<FaqRepository>(FaqRepository);
  });

  describe('findAllActive', () => {
    it('returns only active items ordered by sortOrder then createdAt', async () => {
      prismaMock.faqItem.findMany.mockResolvedValue([mockFaq]);

      const result = await repository.findAllActive();

      expect(result).toEqual([mockFaq]);
      expect(prismaMock.faqItem.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    });
  });

  describe('findAllAdmin', () => {
    it('returns all items (any status) ordered by sortOrder', async () => {
      prismaMock.faqItem.findMany.mockResolvedValue([mockFaq]);

      const result = await repository.findAllAdmin();

      expect(result).toEqual({ items: [mockFaq], total: 1 });
      expect(prismaMock.faqItem.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    });

    it('matches the question case-insensitively when searching', async () => {
      prismaMock.faqItem.findMany.mockResolvedValue([]);

      await repository.findAllAdmin({ search: 'ДоСтАв' });

      expect(prismaMock.faqItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { question: { contains: 'ДоСтАв', mode: 'insensitive' } },
        }),
      );
    });

    // TASK-357: absence of page/limit is the "return everything" signal — no skip/take, and
    // no second round-trip just to count rows we already hold.
    it('skips both pagination and the count query when page and limit are absent', async () => {
      prismaMock.faqItem.findMany.mockResolvedValue([mockFaq]);

      await repository.findAllAdmin();

      expect(prismaMock.faqItem.count).not.toHaveBeenCalled();
    });

    it('paginates and counts once either page or limit is present', async () => {
      prismaMock.faqItem.findMany.mockResolvedValue([mockFaq]);
      prismaMock.faqItem.count.mockResolvedValue(31);

      const result = await repository.findAllAdmin({ page: 2, limit: 10 });

      expect(result).toEqual({ items: [mockFaq], total: 31 });
      expect(prismaMock.faqItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
          // A paginated page must slice the operator's own sortOrder sequence, not
          // some other ordering the storefront would never honour.
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        }),
      );
    });
  });

  describe('findById', () => {
    it('finds a FAQ item by id', async () => {
      prismaMock.faqItem.findUnique.mockResolvedValue(mockFaq);

      const result = await repository.findById('faq-uuid-1');

      expect(result).toEqual(mockFaq);
      expect(prismaMock.faqItem.findUnique).toHaveBeenCalledWith({ where: { id: 'faq-uuid-1' } });
    });

    it('returns null when not found', async () => {
      prismaMock.faqItem.findUnique.mockResolvedValue(null);

      expect(await repository.findById('ghost')).toBeNull();
    });
  });

  // ─── create: appended, never slot 0 (TASK-428) ─────────────────────────────

  describe('create', () => {
    it('appends the item to the END of the list (max + 1) under the list lock', async () => {
      prismaMock.faqItem.aggregate.mockResolvedValue({ _max: { sortOrder: 4 } });
      prismaMock.faqItem.create.mockResolvedValue({ ...mockFaq, sortOrder: 5 });

      const result = await repository.create({
        question: 'Скільки коштує доставка?',
        answer: 'Безкоштовно від 1 000 ₴.',
      });

      expect(result.sortOrder).toBe(5);
      // The max read MUST happen inside the locked transaction, or two concurrent
      // appends both read the same max and collide on one slot.
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prismaMock.faqItem.aggregate).toHaveBeenCalledWith({ _max: { sortOrder: true } });
      expect(prismaMock.faqItem.create).toHaveBeenCalledWith({
        data: {
          question: 'Скільки коштує доставка?',
          answer: 'Безкоштовно від 1 000 ₴.',
          sortOrder: 5,
          isActive: true,
        },
      });
    });

    it('uses slot 0 for the FIRST item in an empty list', async () => {
      prismaMock.faqItem.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      prismaMock.faqItem.create.mockResolvedValue(mockFaq);

      await repository.create({ question: 'Q', answer: 'A' });

      expect(prismaMock.faqItem.create).toHaveBeenCalledWith({
        data: { question: 'Q', answer: 'A', sortOrder: 0, isActive: true },
      });
    });

    it('passes explicit sortOrder/isActive through without reading max', async () => {
      prismaMock.faqItem.create.mockResolvedValue({ ...mockFaq, sortOrder: 5, isActive: false });

      await repository.create({
        question: 'Q',
        answer: 'A',
        sortOrder: 5,
        isActive: false,
      });

      expect(prismaMock.faqItem.aggregate).not.toHaveBeenCalled();
      expect(prismaMock.faqItem.create).toHaveBeenCalledWith({
        data: { question: 'Q', answer: 'A', sortOrder: 5, isActive: false },
      });
    });
  });

  // ─── reorderAll (TASK-428) ─────────────────────────────────────────────────

  describe('reorderAll', () => {
    const a = 'faq-uuid-1';
    const b = 'faq-uuid-2';

    it('locks the list, writes the index as sortOrder and returns the refreshed list', async () => {
      prismaMock.faqItem.findMany
        // 1) the in-transaction snapshot of the bucket's membership
        .mockResolvedValueOnce([{ id: a }, { id: b }])
        // 2) the refreshed admin list, read inside the same transaction
        .mockResolvedValueOnce([
          { ...mockFaq, id: b, sortOrder: 0 },
          { ...mockFaq, sortOrder: 1 },
        ]);

      const result = await repository.reorderAll([b, a]);

      expect(result.total).toBe(2);
      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prismaMock.faqItem.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: b },
        data: { sortOrder: 0 },
      });
      expect(prismaMock.faqItem.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: a },
        data: { sortOrder: 1 },
      });
    });

    it('rejects a PARTIAL ordering (a row appeared underneath the client) as stale', async () => {
      prismaMock.faqItem.findMany.mockResolvedValueOnce([{ id: a }, { id: b }]);

      await expect(repository.reorderAll([a])).rejects.toBeInstanceOf(ReorderStaleError);
      expect(prismaMock.faqItem.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('writes only the provided fields', async () => {
      prismaMock.faqItem.update.mockResolvedValue({ ...mockFaq, sortOrder: 3 });

      const result = await repository.update('faq-uuid-1', { sortOrder: 3 });

      expect(result.sortOrder).toBe(3);
      expect(prismaMock.faqItem.update).toHaveBeenCalledWith({
        where: { id: 'faq-uuid-1' },
        data: { sortOrder: 3 },
      });
    });
  });

  describe('delete', () => {
    it('deletes the item by id', async () => {
      prismaMock.faqItem.delete.mockResolvedValue(mockFaq);

      const result = await repository.delete('faq-uuid-1');

      expect(result).toEqual(mockFaq);
      expect(prismaMock.faqItem.delete).toHaveBeenCalledWith({ where: { id: 'faq-uuid-1' } });
    });
  });
});
