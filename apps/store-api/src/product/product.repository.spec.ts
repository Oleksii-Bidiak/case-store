import { ProductRepository } from './product.repository';
import { PrismaService } from '../prisma';

// ─── Mock PrismaService ──────────────────────────────────────────────────────

const prismaMock = {
  product: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
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

      await repository.findAll({ page: 1, limit: 20, categoryId: 'cat-1', isActive: true });

      const findManyArgs = prismaMock.product.findMany.mock.calls[0][0];
      expect(findManyArgs.where).toEqual(
        expect.objectContaining({ deletedAt: null, categoryId: 'cat-1', isActive: true }),
      );
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
});
