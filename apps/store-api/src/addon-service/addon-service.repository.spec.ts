import { Test, TestingModule } from '@nestjs/testing';
import { AddonDeltaType } from '@prisma/client';
import { AddonServiceRepository } from './addon-service.repository';
import { PrismaService } from '../prisma';

/**
 * Unit tests for the add-on-service repository (TASK-174). Prisma is mocked —
 * these pin the QUERY SHAPES the resolver and the admin panels depend on:
 * batched reads (no N+1), the transactional full-replace of a category template,
 * and the delta upsert/clear contract.
 */
describe('AddonServiceRepository (TASK-174)', () => {
  let repo: AddonServiceRepository;

  const addonService = {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const categoryAddonTemplate = {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  };
  const addonServiceDelta = { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() };

  const tx = { categoryAddonTemplate };
  const $transaction = jest.fn((cb: (t: typeof tx) => Promise<unknown>) => cb(tx));

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddonServiceRepository,
        {
          provide: PrismaService,
          useValue: { addonService, categoryAddonTemplate, addonServiceDelta, $transaction },
        },
      ],
    }).compile();
    repo = module.get(AddonServiceRepository);
  });

  describe('findAllAdmin', () => {
    it('applies the isActive filter and the name search, and paginates', async () => {
      addonService.findMany.mockResolvedValue([]);
      addonService.count.mockResolvedValue(0);

      await repo.findAllAdmin({ page: 2, limit: 10, isActive: false, search: 'гарант' });

      expect(addonService.findMany).toHaveBeenCalledWith({
        where: { isActive: false, name: { contains: 'гарант', mode: 'insensitive' } },
        skip: 10,
        take: 10,
        orderBy: { name: 'asc' },
      });
    });

    it('omits the isActive filter entirely when the query does not set it', async () => {
      addonService.findMany.mockResolvedValue([]);
      addonService.count.mockResolvedValue(0);

      await repo.findAllAdmin({ page: 1, limit: 20 });

      expect(addonService.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });
  });

  describe('batched reads (no N+1)', () => {
    it('findTemplateRowsForCategories issues ONE query for many categories', async () => {
      categoryAddonTemplate.findMany.mockResolvedValue([]);

      await repo.findTemplateRowsForCategories(['c1', 'c2', 'c3']);

      expect(categoryAddonTemplate.findMany).toHaveBeenCalledTimes(1);
      expect(categoryAddonTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { categoryId: { in: ['c1', 'c2', 'c3'] } } }),
      );
    });

    it('findDeltaRowsForProducts issues ONE query for many products', async () => {
      addonServiceDelta.findMany.mockResolvedValue([]);

      await repo.findDeltaRowsForProducts(['p1', 'p2']);

      expect(addonServiceDelta.findMany).toHaveBeenCalledTimes(1);
      expect(addonServiceDelta.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { productId: { in: ['p1', 'p2'] } } }),
      );
    });

    it('short-circuits an empty id list without touching the DB', async () => {
      expect(await repo.findTemplateRowsForCategories([])).toEqual([]);
      expect(await repo.findDeltaRowsForProducts([])).toEqual([]);

      expect(categoryAddonTemplate.findMany).not.toHaveBeenCalled();
      expect(addonServiceDelta.findMany).not.toHaveBeenCalled();
    });
  });

  describe('replaceCategoryTemplate', () => {
    it('adds the new rows and deletes the gone ones, in ONE transaction', async () => {
      categoryAddonTemplate.findMany.mockResolvedValue([
        { addonServiceId: 'svc-a' },
        { addonServiceId: 'svc-b' },
      ]);

      await repo.replaceCategoryTemplate('cat-1', ['svc-b', 'svc-c']);

      expect($transaction).toHaveBeenCalledTimes(1);
      expect(categoryAddonTemplate.deleteMany).toHaveBeenCalledWith({
        where: { categoryId: 'cat-1', addonServiceId: { in: ['svc-a'] } },
      });
      expect(categoryAddonTemplate.createMany).toHaveBeenCalledWith({
        data: [{ categoryId: 'cat-1', addonServiceId: 'svc-c' }],
      });
    });

    it('writes nothing when the list is unchanged (no-op save keeps createdAt)', async () => {
      categoryAddonTemplate.findMany.mockResolvedValue([{ addonServiceId: 'svc-a' }]);

      await repo.replaceCategoryTemplate('cat-1', ['svc-a']);

      expect(categoryAddonTemplate.deleteMany).not.toHaveBeenCalled();
      expect(categoryAddonTemplate.createMany).not.toHaveBeenCalled();
    });

    it('clears the whole own template for an empty list (falls back to inheritance)', async () => {
      categoryAddonTemplate.findMany.mockResolvedValue([
        { addonServiceId: 'svc-a' },
        { addonServiceId: 'svc-b' },
      ]);

      await repo.replaceCategoryTemplate('cat-1', []);

      expect(categoryAddonTemplate.deleteMany).toHaveBeenCalledWith({
        where: { categoryId: 'cat-1', addonServiceId: { in: ['svc-a', 'svc-b'] } },
      });
      expect(categoryAddonTemplate.createMany).not.toHaveBeenCalled();
    });
  });

  describe('product deltas', () => {
    it('upserts on the (productId, addonServiceId) unique pair, never piling up rows', async () => {
      addonServiceDelta.upsert.mockResolvedValue({});
      addonServiceDelta.findMany.mockResolvedValue([
        { id: 'd1', productId: 'p1', addonServiceId: 'svc-a', type: 'OVERRIDE', price: '10.00' },
      ]);

      const row = await repo.upsertProductDelta('p1', 'svc-a', AddonDeltaType.OVERRIDE, '10.00');

      expect(addonServiceDelta.upsert).toHaveBeenCalledWith({
        where: { productId_addonServiceId: { productId: 'p1', addonServiceId: 'svc-a' } },
        update: { type: 'OVERRIDE', price: '10.00' },
        create: {
          productId: 'p1',
          addonServiceId: 'svc-a',
          type: 'OVERRIDE',
          price: '10.00',
        },
      });
      expect(row.id).toBe('d1');
    });

    it('clearProductDelta deletes the row entirely and is idempotent', async () => {
      addonServiceDelta.deleteMany.mockResolvedValue({ count: 0 });

      await expect(repo.clearProductDelta('p1', 'svc-a')).resolves.toBeUndefined();

      expect(addonServiceDelta.deleteMany).toHaveBeenCalledWith({
        where: { productId: 'p1', addonServiceId: 'svc-a' },
      });
    });
  });
});
