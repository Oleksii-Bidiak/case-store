import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma';
import { BrandRepository } from './brand.repository';

const mockBrand = {
  id: 'brand-uuid-1',
  name: 'Spigen',
  slug: 'spigen',
  logo: 'https://example.com/logos/spigen.svg',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const prismaMock = {
  brand: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

describe('BrandRepository', () => {
  let repository: BrandRepository;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [BrandRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    repository = module.get<BrandRepository>(BrandRepository);
  });

  describe('findById / findBySlug', () => {
    it('finds a brand by id', async () => {
      prismaMock.brand.findUnique.mockResolvedValue(mockBrand);

      const result = await repository.findById('brand-uuid-1');

      expect(result).toEqual(mockBrand);
      expect(prismaMock.brand.findUnique).toHaveBeenCalledWith({ where: { id: 'brand-uuid-1' } });
    });

    it('finds a brand by slug', async () => {
      prismaMock.brand.findUnique.mockResolvedValue(mockBrand);

      const result = await repository.findBySlug('spigen');

      expect(result).toEqual(mockBrand);
      expect(prismaMock.brand.findUnique).toHaveBeenCalledWith({ where: { slug: 'spigen' } });
    });

    it('returns null when not found', async () => {
      prismaMock.brand.findUnique.mockResolvedValue(null);

      expect(await repository.findById('ghost')).toBeNull();
    });
  });

  describe('findAllActive', () => {
    it('returns only active brands ordered by name', async () => {
      prismaMock.brand.findMany.mockResolvedValue([mockBrand]);

      const result = await repository.findAllActive();

      expect(result).toEqual([mockBrand]);
      expect(prismaMock.brand.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('findAllAdmin', () => {
    it('paginates with no filters (skip/take derived from page/limit)', async () => {
      prismaMock.brand.findMany.mockResolvedValue([mockBrand]);
      prismaMock.brand.count.mockResolvedValue(1);

      const result = await repository.findAllAdmin({ page: 1, limit: 20 });

      expect(result).toEqual({ brands: [mockBrand], total: 1 });
      expect(prismaMock.brand.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 20,
        orderBy: { name: 'asc' },
      });
    });

    it('applies the isActive filter and name search, and offsets by page', async () => {
      prismaMock.brand.findMany.mockResolvedValue([]);
      prismaMock.brand.count.mockResolvedValue(0);

      await repository.findAllAdmin({ page: 2, limit: 10, isActive: false, search: 'spig' });

      expect(prismaMock.brand.findMany).toHaveBeenCalledWith({
        where: { isActive: false, name: { contains: 'spig', mode: 'insensitive' } },
        skip: 10,
        take: 10,
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('create', () => {
    it('creates a brand with defaults for logo/isActive', async () => {
      prismaMock.brand.create.mockResolvedValue(mockBrand);

      const result = await repository.create({ name: 'Spigen', slug: 'spigen' });

      expect(result).toEqual(mockBrand);
      expect(prismaMock.brand.create).toHaveBeenCalledWith({
        data: { name: 'Spigen', slug: 'spigen', logo: null, isActive: true },
      });
    });
  });

  describe('update', () => {
    it('writes only the provided fields', async () => {
      prismaMock.brand.update.mockResolvedValue({ ...mockBrand, name: 'Spigen UA' });

      const result = await repository.update('brand-uuid-1', { name: 'Spigen UA' });

      expect(result.name).toBe('Spigen UA');
      expect(prismaMock.brand.update).toHaveBeenCalledWith({
        where: { id: 'brand-uuid-1' },
        data: { name: 'Spigen UA' },
      });
    });
  });

  describe('setActive', () => {
    it('toggles the active flag', async () => {
      prismaMock.brand.update.mockResolvedValue({ ...mockBrand, isActive: false });

      const result = await repository.setActive('brand-uuid-1', false);

      expect(result.isActive).toBe(false);
      expect(prismaMock.brand.update).toHaveBeenCalledWith({
        where: { id: 'brand-uuid-1' },
        data: { isActive: false },
      });
    });
  });
});
