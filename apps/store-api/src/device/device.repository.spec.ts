import { Test, TestingModule } from '@nestjs/testing';
import { DeviceRepository } from './device.repository';
import { PrismaService } from '../prisma';
import { ReorderDuplicateIdError } from '../common/reorder';

describe('DeviceRepository', () => {
  let repo: DeviceRepository;

  /**
   * ONE deviceBrand delegate shared by the singleton and the transaction client (TASK-295):
   * `createBrand` and `reorderBrands` write through `tx.deviceBrand`, the plain reads
   * through `this.prisma.deviceBrand`, and the assertions do not care which.
   */
  const deviceBrandDelegate = {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };

  const txMock = {
    deviceBrand: deviceBrandDelegate,
    // `pg_advisory_xact_lock` — taken by `createBrand` and by `reorderBrands`.
    $executeRaw: jest.fn(),
  };

  const prismaMock = {
    deviceBrand: deviceBrandDelegate,
    deviceModel: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [DeviceRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    repo = module.get(DeviceRepository);
  });

  // ─── brands: create + reorder (TASK-295) ──────────────────────────────────

  describe('createBrand', () => {
    // Trap A: with the hand-typed `sortOrder` field gone from the admin form, the old
    // `?? 0` default would stack every new brand ON TOP OF the first one.
    it('APPENDS a new brand to the end of the list (max + 1), under the bucket lock', async () => {
      deviceBrandDelegate.aggregate.mockResolvedValue({ _max: { sortOrder: 1 } });
      deviceBrandDelegate.create.mockResolvedValue({ id: 'brand-1' });

      await repo.createBrand({ name: 'Xiaomi', slug: 'xiaomi' });

      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
      expect(deviceBrandDelegate.create).toHaveBeenCalledWith({
        data: { name: 'Xiaomi', slug: 'xiaomi', sortOrder: 2, isActive: true },
      });
    });

    it('starts an EMPTY list at slot 0', async () => {
      deviceBrandDelegate.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      deviceBrandDelegate.create.mockResolvedValue({ id: 'brand-1' });

      await repo.createBrand({ name: 'Apple', slug: 'apple' });

      expect(deviceBrandDelegate.create).toHaveBeenCalledWith({
        data: { name: 'Apple', slug: 'apple', sortOrder: 0, isActive: true },
      });
    });

    it('honours an EXPLICIT sortOrder without reading the list max', async () => {
      deviceBrandDelegate.create.mockResolvedValue({ id: 'brand-1' });

      await repo.createBrand({ name: 'Apple', slug: 'apple', sortOrder: 9 });

      expect(deviceBrandDelegate.aggregate).not.toHaveBeenCalled();
      expect(deviceBrandDelegate.create).toHaveBeenCalledWith({
        data: { name: 'Apple', slug: 'apple', sortOrder: 9, isActive: true },
      });
    });
  });

  describe('reorderBrands', () => {
    const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    it('locks the list, writes index → sortOrder and returns the refreshed admin list', async () => {
      // 1st findMany = the in-tx snapshot; 2nd = the refreshed list WITH model counts.
      deviceBrandDelegate.findMany
        .mockResolvedValueOnce([{ id: a }, { id: b }])
        .mockResolvedValueOnce([
          { id: b, name: 'Samsung', _count: { models: 4 } },
          { id: a, name: 'Apple', _count: { models: 7 } },
        ]);

      const result = await repo.reorderBrands([b, a]);

      expect(result).toEqual({
        brands: [
          { brand: { id: b, name: 'Samsung' }, modelCount: 4 },
          { brand: { id: a, name: 'Apple' }, modelCount: 7 },
        ],
        total: 2,
      });
      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
      expect(deviceBrandDelegate.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: b },
        data: { sortOrder: 0 },
      });
      expect(deviceBrandDelegate.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: a },
        data: { sortOrder: 1 },
      });
    });

    it('rejects a duplicate id (DUPLICATE_ID) and writes nothing', async () => {
      deviceBrandDelegate.findMany.mockResolvedValueOnce([{ id: a }, { id: b }]);

      await expect(repo.reorderBrands([a, a])).rejects.toBeInstanceOf(ReorderDuplicateIdError);

      expect(deviceBrandDelegate.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('findModels', () => {
    it('builds a brand + active + search where clause and paginates', async () => {
      prismaMock.deviceModel.findMany.mockResolvedValue([]);
      prismaMock.deviceModel.count.mockResolvedValue(0);

      await repo.findModels({
        page: 2,
        limit: 10,
        deviceBrandId: 'brand-1',
        search: 'pro',
        isActive: true,
      });

      expect(prismaMock.deviceModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isActive: true,
            deviceBrandId: 'brand-1',
            name: { contains: 'pro', mode: 'insensitive' },
          },
          skip: 10,
          take: 10,
        }),
      );
    });

    it('omits the isActive filter when not specified (admin, all statuses)', async () => {
      prismaMock.deviceModel.findMany.mockResolvedValue([]);
      prismaMock.deviceModel.count.mockResolvedValue(0);

      await repo.findModels({});

      const arg = prismaMock.deviceModel.findMany.mock.calls[0][0];
      expect(arg.where).not.toHaveProperty('isActive');
    });
  });

  describe('findModelsByIds', () => {
    it('short-circuits to [] for an empty id set (no query)', async () => {
      const result = await repo.findModelsByIds([]);

      expect(result).toEqual([]);
      expect(prismaMock.deviceModel.findMany).not.toHaveBeenCalled();
    });

    it('queries the given ids with the brand relation', async () => {
      prismaMock.deviceModel.findMany.mockResolvedValue([]);

      await repo.findModelsByIds(['a', 'b']);

      expect(prismaMock.deviceModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['a', 'b'] } } }),
      );
    });
  });

  describe('findBrandsWithCount', () => {
    const brandRow = {
      id: 'b1',
      name: 'Apple',
      slug: 'apple',
      isActive: true,
      sortOrder: 0,
      _count: { models: 5 },
    };

    it('maps the _count relation into a flat modelCount', async () => {
      prismaMock.deviceBrand.findMany.mockResolvedValue([brandRow]);

      const result = await repo.findBrandsWithCount();

      expect(result.brands[0]).toEqual({
        brand: { id: 'b1', name: 'Apple', slug: 'apple', isActive: true, sortOrder: 0 },
        modelCount: 5,
      });
      expect(result.total).toBe(1);
    });

    it('matches the name case-insensitively when searching', async () => {
      prismaMock.deviceBrand.findMany.mockResolvedValue([]);

      await repo.findBrandsWithCount({ search: 'ApPl' });

      expect(prismaMock.deviceBrand.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { name: { contains: 'ApPl', mode: 'insensitive' } } }),
      );
    });

    // TASK-357: absence of page/limit is the "return everything" signal the reorder UI
    // depends on — no skip/take, and no second round-trip to count rows we already hold.
    it('skips both pagination and the count query when page and limit are absent', async () => {
      prismaMock.deviceBrand.findMany.mockResolvedValue([brandRow]);

      await repo.findBrandsWithCount();

      expect(prismaMock.deviceBrand.count).not.toHaveBeenCalled();
    });

    it('paginates and counts once either page or limit is present', async () => {
      prismaMock.deviceBrand.findMany.mockResolvedValue([brandRow]);
      prismaMock.deviceBrand.count.mockResolvedValue(18);

      const result = await repo.findBrandsWithCount({ page: 2, limit: 5 });

      expect(result.total).toBe(18);
      expect(prismaMock.deviceBrand.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
    });
  });
});
