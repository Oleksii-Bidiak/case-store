import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma';
import { FaqRepository } from './faq.repository';

const mockFaq = {
  id: 'faq-uuid-1',
  question: 'Скільки коштує доставка?',
  answer: 'Безкоштовно від 1 000 ₴.',
  sortOrder: 0,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const prismaMock = {
  faqItem: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
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

  describe('create', () => {
    it('creates a FAQ item with defaults for sortOrder/isActive', async () => {
      prismaMock.faqItem.create.mockResolvedValue(mockFaq);

      const result = await repository.create({
        question: 'Скільки коштує доставка?',
        answer: 'Безкоштовно від 1 000 ₴.',
      });

      expect(result).toEqual(mockFaq);
      expect(prismaMock.faqItem.create).toHaveBeenCalledWith({
        data: {
          question: 'Скільки коштує доставка?',
          answer: 'Безкоштовно від 1 000 ₴.',
          sortOrder: 0,
          isActive: true,
        },
      });
    });

    it('passes explicit sortOrder/isActive through', async () => {
      prismaMock.faqItem.create.mockResolvedValue({ ...mockFaq, sortOrder: 5, isActive: false });

      await repository.create({
        question: 'Q',
        answer: 'A',
        sortOrder: 5,
        isActive: false,
      });

      expect(prismaMock.faqItem.create).toHaveBeenCalledWith({
        data: { question: 'Q', answer: 'A', sortOrder: 5, isActive: false },
      });
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
