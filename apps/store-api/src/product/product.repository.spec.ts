import { ProductRepository } from './product.repository';
import { PrismaService } from '../prisma';

// ─── Mock PrismaService ──────────────────────────────────────────────────────

const prismaMock = {
  product: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  productImage: {
    findMany: jest.fn(),
  },
  review: {
    groupBy: jest.fn(),
  },
};

describe('ProductRepository (soft-delete behaviour)', () => {
  let repository: ProductRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new ProductRepository(prismaMock as unknown as PrismaService);
  });

  // ─── read paths exclude tombstoned rows ─────────────────────────────────────

  describe('findById', () => {
    it('should filter out soft-deleted products via deletedAt: null', async () => {
      prismaMock.product.findFirst.mockResolvedValue(null);

      await repository.findById('product-1');

      expect(prismaMock.product.findFirst).toHaveBeenCalledWith({
        where: { id: 'product-1', deletedAt: null },
        include: { brand: { select: { id: true, name: true, slug: true, logo: true } } },
      });
    });
  });

  describe('findBySlug', () => {
    it('should exclude soft-deleted products', async () => {
      prismaMock.product.findFirst.mockResolvedValue(null);

      await repository.findBySlug('clear-case');

      expect(prismaMock.product.findFirst).toHaveBeenCalledWith({
        where: { slug: 'clear-case', deletedAt: null },
      });
    });
  });

  describe('findBySku', () => {
    it('should exclude soft-deleted products', async () => {
      prismaMock.product.findFirst.mockResolvedValue(null);

      await repository.findBySku('SKU-1');

      expect(prismaMock.product.findFirst).toHaveBeenCalledWith({
        where: { sku: 'SKU-1', deletedAt: null },
      });
    });
  });

  // ─── findBySlugWithRelations — public detail read (TASK-145) ─────────────────
  // The public PDP endpoint must hide deactivated products: the default query
  // filters `isActive: true`. The `activeOnly: false` override (reserved for the
  // future staff preview, TASK-155) drops that filter.

  describe('findBySlugWithRelations', () => {
    it('should include isActive: true in the where clause by default', async () => {
      prismaMock.product.findFirst.mockResolvedValue(null);

      await repository.findBySlugWithRelations('clear-case');

      const findFirstArgs = prismaMock.product.findFirst.mock.calls[0][0];
      expect(findFirstArgs.where).toEqual({
        slug: 'clear-case',
        isActive: true,
        deletedAt: null,
      });
    });

    it('should omit the isActive filter when activeOnly is false', async () => {
      prismaMock.product.findFirst.mockResolvedValue(null);

      await repository.findBySlugWithRelations('clear-case', { activeOnly: false });

      const findFirstArgs = prismaMock.product.findFirst.mock.calls[0][0];
      expect(findFirstArgs.where).toEqual({
        slug: 'clear-case',
        deletedAt: null,
      });
      expect(findFirstArgs.where).not.toHaveProperty('isActive');
    });
  });

  describe('findAll', () => {
    it('should always constrain the where clause with deletedAt: null', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.product.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20 });

      const findManyArgs = prismaMock.product.findMany.mock.calls[0][0];
      expect(findManyArgs.where).toEqual(expect.objectContaining({ deletedAt: null }));
      const countArgs = prismaMock.product.count.mock.calls[0][0];
      expect(countArgs.where).toEqual(expect.objectContaining({ deletedAt: null }));
    });

    it('should keep deletedAt: null alongside other filters', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.product.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20, categoryIds: ['cat-1'], isActive: true });

      const findManyArgs = prismaMock.product.findMany.mock.calls[0][0];
      expect(findManyArgs.where).toEqual(
        expect.objectContaining({ deletedAt: null, categoryId: { in: ['cat-1'] }, isActive: true }),
      );
    });

    // TASK-236: the category filter now matches the whole expanded subtree via
    // an `IN (...)` clause, so a parent category rolls up its subcategories.
    it('matches the full category subtree with an IN clause', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.product.count.mockResolvedValue(0);

      await repository.findAll({
        page: 1,
        limit: 20,
        categoryIds: ['root', 'child', 'grandchild'],
      });

      const findManyArgs = prismaMock.product.findMany.mock.calls[0][0];
      expect(findManyArgs.where).toEqual(
        expect.objectContaining({ categoryId: { in: ['root', 'child', 'grandchild'] } }),
      );
    });

    it('attaches active sibling positions of each grouped product for the variant summary', async () => {
      prismaMock.product.findMany
        // page rows
        .mockResolvedValueOnce([{ id: 'p1', groupId: 'grp-1' }])
        // variant siblings query
        .mockResolvedValueOnce([
          {
            id: 'p1',
            slug: 'p1',
            groupId: 'grp-1',
            price: { toString: () => '9.99' },
            attributes: { color: 'Black' },
            stock: 3,
            positionOrder: 0,
          },
          {
            id: 'p2',
            slug: 'p2',
            groupId: 'grp-1',
            price: { toString: () => '12.99' },
            attributes: { color: 'White' },
            stock: 1,
            positionOrder: 1,
          },
        ]);
      prismaMock.product.count.mockResolvedValue(1);
      prismaMock.review.groupBy.mockResolvedValue([]);
      prismaMock.productImage.findMany.mockResolvedValue([]);

      const result = await repository.findAll({ page: 1, limit: 20 });

      // Sibling query is scoped to the page's groups, active and non-deleted.
      const variantQuery = prismaMock.product.findMany.mock.calls[1][0];
      expect(variantQuery.where).toEqual({
        groupId: { in: ['grp-1'] },
        isActive: true,
        deletedAt: null,
      });
      expect(result.products[0].variantSiblings).toHaveLength(2);
      expect(result.products[0].variantSiblings?.[0]).not.toHaveProperty('groupId');
    });

    it('does not run a sibling query when no product on the page has a group', async () => {
      prismaMock.product.findMany.mockResolvedValueOnce([{ id: 'p1', groupId: null }]);
      prismaMock.product.count.mockResolvedValue(1);
      prismaMock.review.groupBy.mockResolvedValue([]);
      prismaMock.productImage.findMany.mockResolvedValue([]);

      const result = await repository.findAll({ page: 1, limit: 20 });

      // Only the page query ran — no second product.findMany for siblings.
      expect(prismaMock.product.findMany).toHaveBeenCalledTimes(1);
      expect(result.products[0].variantSiblings).toBeUndefined();
    });
  });

  // ─── softDelete ─────────────────────────────────────────────────────────────

  describe('softDelete', () => {
    it('should set deletedAt, isActive=false, and mangled slug/sku', async () => {
      prismaMock.product.update.mockResolvedValue({ id: 'product-1' });

      await repository.softDelete(
        'product-1',
        'deleted:product-1:clear-case',
        'deleted:product-1:SKU-1',
      );

      const updateArgs = prismaMock.product.update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ id: 'product-1' });
      expect(updateArgs.data.isActive).toBe(false);
      expect(updateArgs.data.slug).toBe('deleted:product-1:clear-case');
      expect(updateArgs.data.sku).toBe('deleted:product-1:SKU-1');
      expect(updateArgs.data.deletedAt).toBeInstanceOf(Date);
    });

    it('should pass a null sku through unchanged when the product had none', async () => {
      prismaMock.product.update.mockResolvedValue({ id: 'product-2' });

      await repository.softDelete('product-2', 'deleted:product-2:no-sku-product', null);

      const updateArgs = prismaMock.product.update.mock.calls[0][0];
      expect(updateArgs.data.sku).toBeNull();
    });
  });

  // ─── SEO meta pass-through (TASK-241) ───────────────────────────────────────

  describe('SEO meta (TASK-241)', () => {
    it('create persists metaTitle/metaDescription when provided', async () => {
      prismaMock.product.create.mockResolvedValue({ id: 'product-1' });

      await repository.create({
        name: 'Clear Case',
        slug: 'clear-case',
        price: 29.99,
        categoryId: 'cat-1',
        metaTitle: 'Clear Case | Store',
        metaDescription: 'A crystal-clear protective case.',
      });

      const createArgs = prismaMock.product.create.mock.calls[0][0];
      expect(createArgs.data.metaTitle).toBe('Clear Case | Store');
      expect(createArgs.data.metaDescription).toBe('A crystal-clear protective case.');
    });

    it('create defaults metaTitle/metaDescription to null when omitted', async () => {
      prismaMock.product.create.mockResolvedValue({ id: 'product-2' });

      await repository.create({
        name: 'Plain Case',
        slug: 'plain-case',
        price: 9.99,
        categoryId: 'cat-1',
      });

      const createArgs = prismaMock.product.create.mock.calls[0][0];
      expect(createArgs.data.metaTitle).toBeNull();
      expect(createArgs.data.metaDescription).toBeNull();
    });

    it('update forwards metaTitle/metaDescription through the spread', async () => {
      prismaMock.product.update.mockResolvedValue({ id: 'product-3' });

      await repository.update('product-3', {
        metaTitle: 'Updated Title',
        metaDescription: 'Updated description.',
      });

      const updateArgs = prismaMock.product.update.mock.calls[0][0];
      expect(updateArgs.data.metaTitle).toBe('Updated Title');
      expect(updateArgs.data.metaDescription).toBe('Updated description.');
    });
  });
});
