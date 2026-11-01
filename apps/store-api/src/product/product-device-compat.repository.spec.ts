import { Test, TestingModule } from '@nestjs/testing';
import { ProductDeviceCompatRepository } from './product-device-compat.repository';
import { PrismaService } from '../prisma';

describe('ProductDeviceCompatRepository', () => {
  let repo: ProductDeviceCompatRepository;

  const prismaMock = {
    productDeviceCompat: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    // $transaction runs the array of prepared operations (they are mock return
    // values here) — mirrors Prisma's batch semantics closely enough for a unit.
    $transaction: jest.fn((ops: unknown[]) => Promise.resolve(ops)),
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((ops: unknown[]) => Promise.resolve(ops));
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProductDeviceCompatRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    repo = module.get(ProductDeviceCompatRepository);
  });

  describe('setDeviceCompat', () => {
    it('replaces the set inside one transaction (delete + insert, de-duplicated)', async () => {
      await repo.setDeviceCompat('p1', ['m1', 'm2', 'm1']);

      expect(prismaMock.productDeviceCompat.deleteMany).toHaveBeenCalledWith({
        where: { productId: 'p1' },
      });
      expect(prismaMock.productDeviceCompat.createMany).toHaveBeenCalledWith({
        data: [
          { productId: 'p1', deviceModelId: 'm1' },
          { productId: 'p1', deviceModelId: 'm2' },
        ],
        skipDuplicates: true,
      });
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it('clears all compat when given an empty set (delete only, no insert)', async () => {
      await repo.setDeviceCompat('p1', []);

      expect(prismaMock.productDeviceCompat.deleteMany).toHaveBeenCalled();
      expect(prismaMock.productDeviceCompat.createMany).not.toHaveBeenCalled();
    });
  });

  describe('setDeviceCompatForGroup', () => {
    it('applies the set to every sibling position and returns each position with its slug and isActive', async () => {
      const positions = [
        { id: 'p1', slug: 'case-red', isActive: true },
        { id: 'p2', slug: 'case-blue', isActive: false },
        { id: 'p3', slug: 'case-green', isActive: true },
      ];
      prismaMock.product.findMany.mockResolvedValue(positions);

      const result = await repo.setDeviceCompatForGroup('g1', ['m1']);

      expect(result).toEqual({ updatedCount: 3, positions });
      expect(prismaMock.product.findMany).toHaveBeenCalledWith({
        where: { groupId: 'g1', deletedAt: null },
        select: { id: true, slug: true, isActive: true },
      });
      expect(prismaMock.productDeviceCompat.deleteMany).toHaveBeenCalledWith({
        where: { productId: { in: ['p1', 'p2', 'p3'] } },
      });
      expect(prismaMock.productDeviceCompat.createMany).toHaveBeenCalledWith({
        data: [
          { productId: 'p1', deviceModelId: 'm1' },
          { productId: 'p2', deviceModelId: 'm1' },
          { productId: 'p3', deviceModelId: 'm1' },
        ],
        skipDuplicates: true,
      });
    });

    it('returns count 0 and writes nothing when the group has no positions', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);

      const result = await repo.setDeviceCompatForGroup('empty', ['m1']);

      expect(result).toEqual({ updatedCount: 0, positions: [] });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('getDeviceCompatByProductIds', () => {
    it('returns an empty map for no ids (no query)', async () => {
      const map = await repo.getDeviceCompatByProductIds([]);

      expect(map.size).toBe(0);
      expect(prismaMock.productDeviceCompat.findMany).not.toHaveBeenCalled();
    });

    it('groups compat summaries by productId with a flat brand name', async () => {
      prismaMock.productDeviceCompat.findMany.mockResolvedValue([
        {
          productId: 'p1',
          deviceModel: { id: 'm1', name: 'iPhone 15', slug: 'iphone-15', brand: { name: 'Apple' } },
        },
        {
          productId: 'p1',
          deviceModel: { id: 'm2', name: 'iPhone 14', slug: 'iphone-14', brand: { name: 'Apple' } },
        },
      ]);

      const map = await repo.getDeviceCompatByProductIds(['p1']);

      expect(map.get('p1')).toEqual([
        { id: 'm1', name: 'iPhone 15', slug: 'iphone-15', brandName: 'Apple' },
        { id: 'm2', name: 'iPhone 14', slug: 'iphone-14', brandName: 'Apple' },
      ]);
    });
  });

  describe('getDeviceModelIdsByProductIds (TASK-1953)', () => {
    it('answers a whole page with exactly ONE query, ids only', async () => {
      prismaMock.productDeviceCompat.findMany.mockResolvedValue([
        { productId: 'p1', deviceModelId: 'm1' },
        { productId: 'p1', deviceModelId: 'm2' },
        { productId: 'p3', deviceModelId: 'm1' },
      ]);

      const map = await repo.getDeviceModelIdsByProductIds(['p1', 'p2', 'p3']);

      expect(prismaMock.productDeviceCompat.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.productDeviceCompat.findMany).toHaveBeenCalledWith({
        where: { productId: { in: ['p1', 'p2', 'p3'] } },
        select: { productId: true, deviceModelId: true },
        orderBy: { deviceModelId: 'asc' },
      });
      expect(map.get('p1')).toEqual(['m1', 'm2']);
      // A product with no compat is present with an empty list, not absent.
      expect(map.get('p2')).toEqual([]);
      expect(map.get('p3')).toEqual(['m1']);
    });

    it('costs no query for an empty page', async () => {
      const map = await repo.getDeviceModelIdsByProductIds([]);

      expect(map.size).toBe(0);
      expect(prismaMock.productDeviceCompat.findMany).not.toHaveBeenCalled();
    });
  });

  describe('bulk compat (TASK-1955)', () => {
    it('addCompat creates the cross product, skipping links that exist', async () => {
      prismaMock.productDeviceCompat.createMany.mockResolvedValue({ count: 3 });

      await expect(repo.addCompat(['p1', 'p2'], ['m1', 'm2'])).resolves.toBe(3);

      expect(prismaMock.productDeviceCompat.createMany).toHaveBeenCalledWith({
        data: [
          { productId: 'p1', deviceModelId: 'm1' },
          { productId: 'p1', deviceModelId: 'm2' },
          { productId: 'p2', deviceModelId: 'm1' },
          { productId: 'p2', deviceModelId: 'm2' },
        ],
        skipDuplicates: true,
      });
    });

    it('removeCompat deletes exactly products × models', async () => {
      prismaMock.productDeviceCompat.deleteMany.mockResolvedValue({ count: 2 });

      await expect(repo.removeCompat(['p1'], ['m1', 'm2'])).resolves.toBe(2);

      expect(prismaMock.productDeviceCompat.deleteMany).toHaveBeenCalledWith({
        where: { productId: { in: ['p1'] }, deviceModelId: { in: ['m1', 'm2'] } },
      });
    });

    it('replaceCompat drops the rest and adds the missing in ONE transaction', async () => {
      prismaMock.productDeviceCompat.deleteMany.mockReturnValue({ count: 4 });
      prismaMock.productDeviceCompat.createMany.mockReturnValue({ count: 1 });

      await expect(repo.replaceCompat(['p1', 'p2'], ['m1'])).resolves.toEqual({
        added: 1,
        removed: 4,
      });

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.productDeviceCompat.deleteMany).toHaveBeenCalledWith({
        where: { productId: { in: ['p1', 'p2'] }, deviceModelId: { notIn: ['m1'] } },
      });
      expect(prismaMock.productDeviceCompat.createMany).toHaveBeenCalledWith({
        data: [
          { productId: 'p1', deviceModelId: 'm1' },
          { productId: 'p2', deviceModelId: 'm1' },
        ],
        skipDuplicates: true,
      });
    });

    it('writes nothing for an empty selection', async () => {
      await expect(repo.addCompat([], ['m1'])).resolves.toBe(0);
      await expect(repo.removeCompat(['p1'], [])).resolves.toBe(0);
      await expect(repo.replaceCompat([], ['m1'])).resolves.toEqual({ added: 0, removed: 0 });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.productDeviceCompat.createMany).not.toHaveBeenCalled();
    });

    it('getModelIdSetsByProductIds groups the current pairs per product', async () => {
      prismaMock.productDeviceCompat.findMany.mockResolvedValue([
        { productId: 'p1', deviceModelId: 'm1' },
        { productId: 'p1', deviceModelId: 'm2' },
      ]);

      const map = await repo.getModelIdSetsByProductIds(['p1', 'p2']);

      expect(map.get('p1')).toEqual(new Set(['m1', 'm2']));
      expect(map.has('p2')).toBe(false);
    });
  });

  describe('coverage (TASK-1955)', () => {
    it('rolls counts up to root categories over public products only, as numbers', async () => {
      prismaMock.$queryRaw.mockResolvedValue([
        { rootCategoryId: 'c1', deviceModelId: 'm1', productCount: BigInt(7) },
      ]);

      const rows = await repo.countByRootCategory(['m1', 'm2']);

      expect(rows).toEqual([{ rootCategoryId: 'c1', deviceModelId: 'm1', productCount: 7 }]);
      const sql = (prismaMock.$queryRaw.mock.calls[0] as [{ sql: string; values: unknown[] }])[0];
      expect(sql.sql).toContain('WITH RECURSIVE roots');
      expect(sql.sql).toContain('p.is_active = true');
      expect(sql.sql).toContain('c.ancestors_active = true');
      expect(sql.values).toEqual(expect.arrayContaining(['m1', 'm2']));
    });

    it('costs no query without models', async () => {
      await expect(repo.countByRootCategory([])).resolves.toEqual([]);
      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    });

    it('counts the visible compatible products and the in-stock ones', async () => {
      prismaMock.product.count.mockResolvedValueOnce(10).mockResolvedValueOnce(8);

      await expect(repo.countModelProducts('m1')).resolves.toEqual({
        compatibleProducts: 10,
        inStockProducts: 8,
      });
      expect(prismaMock.product.count).toHaveBeenNthCalledWith(2, {
        where: expect.objectContaining({
          isActive: true,
          deletedAt: null,
          deviceCompat: { some: { deviceModelId: 'm1' } },
          stock: { gt: 0 },
        }),
      });
    });

    it('finds active name matches that have no compat row for the model', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);

      await repo.findNameCandidatesWithoutModel('iPhone 15 Pro', 'm1', 60);

      expect(prismaMock.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isActive: true,
            deletedAt: null,
            name: { contains: 'iPhone 15 Pro', mode: 'insensitive' },
            deviceCompat: { none: { deviceModelId: 'm1' } },
          },
          take: 60,
        }),
      );
    });
  });
});
