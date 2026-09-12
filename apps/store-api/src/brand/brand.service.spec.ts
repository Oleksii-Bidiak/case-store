import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { BrandRepository } from './brand.repository';
import { BrandService } from './brand.service';
import { BrandEntity } from './entities';
import { CategoryRepository } from '../category/category.repository';
import { CacheService } from '../cache';
import { brandListCategoryKey } from '../cache/cache-key.util';

const mockBrand = {
  id: 'brand-uuid-1',
  name: 'Spigen',
  slug: 'spigen',
  logo: null,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const brandRepositoryMock = {
  findById: jest.fn(),
  findBySlug: jest.fn(),
  findAllActive: jest.fn(),
  findAllAdmin: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  setActive: jest.fn(),
};

const categoryRepositoryMock = {
  findSubtreeIds: jest.fn(),
};

const cacheServiceMock = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  delByPrefix: jest.fn(),
};

describe('BrandService', () => {
  let service: BrandService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default to a cache MISS so each test exercises the real path; the caching
    // block below overrides it where the hit is the subject.
    cacheServiceMock.get.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrandService,
        { provide: BrandRepository, useValue: brandRepositoryMock },
        { provide: CategoryRepository, useValue: categoryRepositoryMock },
        { provide: CacheService, useValue: cacheServiceMock },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(300) } },
      ],
    }).compile();

    service = module.get<BrandService>(BrandService);
  });

  describe('findAllActive', () => {
    it('wraps the active brand list in a { data } envelope of entities', async () => {
      brandRepositoryMock.findAllActive.mockResolvedValue([mockBrand]);

      const result = await service.findAllActive();

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toBeInstanceOf(BrandEntity);
      expect(result.data[0].slug).toBe('spigen');
    });

    it('queries every active brand when no category is requested (TASK-414)', async () => {
      brandRepositoryMock.findAllActive.mockResolvedValue([mockBrand]);

      await service.findAllActive();

      expect(brandRepositoryMock.findAllActive).toHaveBeenCalledWith(undefined);
      expect(categoryRepositoryMock.findSubtreeIds).not.toHaveBeenCalled();
    });

    // The dropdown must agree with the grid it filters: the catalogue rolls a
    // parent category up to its descendants (TASK-236), so the brand list has
    // to be narrowed by the SAME subtree — otherwise a brand stocked only in a
    // subcategory would be missing from the parent category's filter.
    it('narrows to the category SUBTREE, not just the category itself', async () => {
      categoryRepositoryMock.findSubtreeIds.mockResolvedValue(['cat-1', 'cat-1-child']);
      brandRepositoryMock.findAllActive.mockResolvedValue([mockBrand]);

      await service.findAllActive('cat-1');

      expect(categoryRepositoryMock.findSubtreeIds).toHaveBeenCalledWith('cat-1');
      expect(brandRepositoryMock.findAllActive).toHaveBeenCalledWith(['cat-1', 'cat-1-child']);
    });
  });

  describe('findAllActive — caching (TASK-414)', () => {
    it('returns the cached envelope on HIT without touching the repository', async () => {
      const cached = { data: [] };
      cacheServiceMock.get.mockResolvedValue(cached);

      const result = await service.findAllActive('cat-1');

      expect(result).toBe(cached);
      expect(brandRepositoryMock.findAllActive).not.toHaveBeenCalled();
      expect(categoryRepositoryMock.findSubtreeIds).not.toHaveBeenCalled();
    });

    it('caches under a per-category key so two categories cannot collide', async () => {
      brandRepositoryMock.findAllActive.mockResolvedValue([mockBrand]);
      categoryRepositoryMock.findSubtreeIds.mockResolvedValue(['cat-1']);

      await service.findAllActive('cat-1');

      expect(cacheServiceMock.get).toHaveBeenCalledWith(brandListCategoryKey('cat-1'));
      expect(cacheServiceMock.set).toHaveBeenCalledWith(
        brandListCategoryKey('cat-1'),
        expect.objectContaining({ data: expect.any(Array) }),
        300,
      );
      expect(brandListCategoryKey('cat-1')).not.toBe(brandListCategoryKey(undefined));
    });
  });

  describe('findAllAdmin', () => {
    it('returns paginated data + meta with computed totalPages', async () => {
      brandRepositoryMock.findAllAdmin.mockResolvedValue({ brands: [mockBrand], total: 21 });

      const result = await service.findAllAdmin({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ total: 21, page: 1, limit: 20, totalPages: 2 });
    });
  });

  describe('findById', () => {
    it('returns the brand entity when found', async () => {
      brandRepositoryMock.findById.mockResolvedValue(mockBrand);

      const result = await service.findById('brand-uuid-1');

      expect(result).toBeInstanceOf(BrandEntity);
    });

    it('throws NotFoundException when missing', async () => {
      brandRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.findById('ghost')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('auto-generates the slug from name when not provided', async () => {
      brandRepositoryMock.findBySlug.mockResolvedValue(null);
      brandRepositoryMock.create.mockResolvedValue(mockBrand);

      await service.create({ name: 'Spigen' });

      expect(brandRepositoryMock.findBySlug).toHaveBeenCalledWith('spigen');
      expect(brandRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'spigen', name: 'Spigen' }),
      );
    });

    it('uses the provided slug verbatim', async () => {
      brandRepositoryMock.findBySlug.mockResolvedValue(null);
      brandRepositoryMock.create.mockResolvedValue(mockBrand);

      await service.create({ name: 'Spigen', slug: 'custom-spigen' });

      expect(brandRepositoryMock.findBySlug).toHaveBeenCalledWith('custom-spigen');
    });

    it('rejects a duplicate slug with ConflictException', async () => {
      brandRepositoryMock.findBySlug.mockResolvedValue(mockBrand);

      await expect(service.create({ name: 'Spigen' })).rejects.toThrow(ConflictException);
      expect(brandRepositoryMock.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the brand is missing', async () => {
      brandRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.update('ghost', { name: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('rejects a slug that collides with a different brand', async () => {
      brandRepositoryMock.findById.mockResolvedValue(mockBrand);
      brandRepositoryMock.findBySlug.mockResolvedValue({ ...mockBrand, id: 'other' });

      await expect(service.update('brand-uuid-1', { slug: 'taken' })).rejects.toThrow(
        ConflictException,
      );
      expect(brandRepositoryMock.update).not.toHaveBeenCalled();
    });

    it('allows re-saving the same slug on the same brand', async () => {
      brandRepositoryMock.findById.mockResolvedValue(mockBrand);
      brandRepositoryMock.update.mockResolvedValue({ ...mockBrand, name: 'Spigen UA' });

      const result = await service.update('brand-uuid-1', { name: 'Spigen UA', slug: 'spigen' });

      // slug unchanged → no uniqueness lookup needed
      expect(brandRepositoryMock.findBySlug).not.toHaveBeenCalled();
      expect(result.name).toBe('Spigen UA');
    });
  });

  describe('setActive', () => {
    it('throws NotFoundException when the brand is missing', async () => {
      brandRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.setActive('ghost', false)).rejects.toThrow(NotFoundException);
    });

    it('toggles the flag through the repository', async () => {
      brandRepositoryMock.findById.mockResolvedValue(mockBrand);
      brandRepositoryMock.setActive.mockResolvedValue({ ...mockBrand, isActive: false });

      const result = await service.setActive('brand-uuid-1', false);

      expect(brandRepositoryMock.setActive).toHaveBeenCalledWith('brand-uuid-1', false);
      expect(result.isActive).toBe(false);
    });
  });
});
