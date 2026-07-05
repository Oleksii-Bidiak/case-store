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
    it('applies the set to every sibling position and returns the count', async () => {
      prismaMock.product.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]);

      const result = await repo.setDeviceCompatForGroup('g1', ['m1']);

      expect(result).toEqual({ updatedCount: 3, productIds: ['p1', 'p2', 'p3'] });
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

      expect(result).toEqual({ updatedCount: 0, productIds: [] });
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
});
