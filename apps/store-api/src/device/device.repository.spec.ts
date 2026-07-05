import { Test, TestingModule } from '@nestjs/testing';
import { DeviceRepository } from './device.repository';
import { PrismaService } from '../prisma';

describe('DeviceRepository', () => {
  let repo: DeviceRepository;

  const prismaMock = {
    deviceBrand: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    deviceModel: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [DeviceRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    repo = module.get(DeviceRepository);
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
    it('maps the _count relation into a flat modelCount', async () => {
      prismaMock.deviceBrand.findMany.mockResolvedValue([
        {
          id: 'b1',
          name: 'Apple',
          slug: 'apple',
          isActive: true,
          sortOrder: 0,
          _count: { models: 5 },
        },
      ]);

      const result = await repo.findBrandsWithCount(false);

      expect(result[0]).toEqual({
        brand: { id: 'b1', name: 'Apple', slug: 'apple', isActive: true, sortOrder: 0 },
        modelCount: 5,
      });
    });
  });
});
