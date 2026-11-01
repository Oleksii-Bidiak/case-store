import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ReorderDuplicateIdError } from '../common/reorder';
import { DeviceRepository } from './device.repository';
import { DeviceService } from './device.service';
import { DeviceModelListQueryDto } from './dto';
import { DEVICE_HUBS_REVALIDATE_TARGET, RevalidationNotifier } from '../publishing';

const mockBrand = {
  id: 'brand-1',
  name: 'Apple',
  slug: 'apple',
  isActive: true,
  sortOrder: 0,
};

const mockModel = {
  id: 'model-1',
  deviceBrandId: 'brand-1',
  name: 'iPhone 15 Pro',
  slug: 'iphone-15-pro',
  series: 'iPhone 15',
  releaseYear: 2023,
  isActive: true,
  brand: { name: 'Apple' },
};

const deviceRepositoryMock = {
  findBrands: jest.fn(),
  findBrandsWithCount: jest.fn(),
  findBrandById: jest.fn(),
  findBrandBySlug: jest.fn(),
  createBrand: jest.fn(),
  updateBrand: jest.fn(),
  findModels: jest.fn(),
  findPublicModels: jest.fn(),
  findModelById: jest.fn(),
  findModelBySlug: jest.fn(),
  findModelsByIds: jest.fn(),
  createModel: jest.fn(),
  updateModel: jest.fn(),
  reorderBrands: jest.fn(),
};

const pinoLoggerMock = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// The model hub /devices/<модель> is ISR (TASK-1954): every write that changes
// a model's name, copy, slug or visibility — or its brand's name — purges it.
const revalidationMock = {
  revalidate: jest.fn().mockResolvedValue(undefined),
};

describe('DeviceService', () => {
  let service: DeviceService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceService,
        { provide: DeviceRepository, useValue: deviceRepositoryMock },
        { provide: PinoLogger, useValue: pinoLoggerMock },
        { provide: RevalidationNotifier, useValue: revalidationMock },
      ],
    }).compile();
    service = module.get(DeviceService);
  });

  describe('getBrands', () => {
    it('returns active brands as entities', async () => {
      deviceRepositoryMock.findBrands.mockResolvedValue([mockBrand]);

      const result = await service.getBrands(true);

      expect(deviceRepositoryMock.findBrands).toHaveBeenCalledWith(true);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'brand-1', name: 'Apple', slug: 'apple' });
    });
  });

  describe('getBrandsWithCount', () => {
    // TASK-357: an unpaginated read still reports a truthful count, so the panel can show
    // "N записів" without branching on whether it asked for pages.
    it('reports the whole list as one page when page/limit are omitted', async () => {
      deviceRepositoryMock.findBrandsWithCount.mockResolvedValue({
        brands: [{ brand: mockBrand, modelCount: 3 }],
        total: 1,
      });

      const result = await service.getBrandsWithCount();

      expect(deviceRepositoryMock.findBrandsWithCount).toHaveBeenCalledWith({
        page: undefined,
        limit: undefined,
        search: undefined,
      });
      expect(result.items[0]).toMatchObject({ id: 'brand-1', modelCount: 3 });
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 1, totalPages: 1 });
    });

    it('forwards pagination and search, and reports the page the caller asked for', async () => {
      deviceRepositoryMock.findBrandsWithCount.mockResolvedValue({
        brands: [{ brand: mockBrand, modelCount: 3 }],
        total: 11,
      });

      const result = await service.getBrandsWithCount({ page: 2, limit: 5, search: 'app' });

      expect(deviceRepositoryMock.findBrandsWithCount).toHaveBeenCalledWith({
        page: 2,
        limit: 5,
        search: 'app',
      });
      expect(result.meta).toEqual({ total: 11, page: 2, limit: 5, totalPages: 3 });
    });
  });

  describe('createBrand', () => {
    it('auto-generates the slug and rejects duplicates', async () => {
      deviceRepositoryMock.findBrandBySlug.mockResolvedValue(null);
      deviceRepositoryMock.createBrand.mockResolvedValue(mockBrand);

      await service.createBrand({ name: 'Apple' });

      expect(deviceRepositoryMock.createBrand).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'apple' }),
      );
    });

    it('throws ConflictException when the slug is taken', async () => {
      deviceRepositoryMock.findBrandBySlug.mockResolvedValue(mockBrand);

      await expect(service.createBrand({ name: 'Apple' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(deviceRepositoryMock.createBrand).not.toHaveBeenCalled();
    });
  });

  describe('getModels', () => {
    /** One row of the public read (brand + visible-product count, TASK-1952). */
    const publicRow = {
      id: 'model-1',
      deviceBrandId: 'brand-1',
      name: 'iPhone 15 Pro',
      slug: 'iphone-15-pro',
      series: 'iPhone 15',
      releaseYear: 2023,
      brandName: 'Apple',
      brandSlug: 'apple',
      productCount: 12,
    };

    it('lists active models scoped to a brand through the light public read', async () => {
      deviceRepositoryMock.findPublicModels.mockResolvedValue([publicRow]);
      const query: DeviceModelListQueryDto = { deviceBrandId: 'brand-1', search: 'pro' };

      const result = await service.getModels(query);

      expect(deviceRepositoryMock.findPublicModels).toHaveBeenCalledWith({
        limit: 200,
        deviceBrandId: 'brand-1',
        search: 'pro',
        sort: undefined,
      });
      expect(deviceRepositoryMock.findModels).not.toHaveBeenCalled();
      expect(result[0]).toEqual(publicRow);
    });

    // TASK-1952 / TASK-2070: the device picker asks for the popular models.
    it.each(['popular', 'name'] as const)('passes sort=%s to the repository', async (sort) => {
      deviceRepositoryMock.findPublicModels.mockResolvedValue([]);

      await service.getModels({ sort, limit: 12 });

      expect(deviceRepositoryMock.findPublicModels).toHaveBeenCalledWith({
        limit: 12,
        deviceBrandId: undefined,
        search: undefined,
        sort,
      });
    });

    // TASK-702: the homepage ModelPicker and the catalog filter pull up to 200
    // rows of this — the landing SEO copy must not ride along, even when the
    // repository hands back a full row.
    it('never serialises the compat-landing SEO fields on the public list', async () => {
      deviceRepositoryMock.findPublicModels.mockResolvedValue([
        {
          ...mockModel,
          brandName: 'Apple',
          brandSlug: 'apple',
          productCount: 3,
          metaTitle: 'Чохли для iPhone 15 Pro',
          metaDescription: 'Опис',
          description: 'Лід',
        },
      ]);

      const result = await service.getModels({});

      expect(Object.keys(result[0]).sort()).toEqual([
        'brandName',
        'brandSlug',
        'deviceBrandId',
        'id',
        'name',
        'productCount',
        'releaseYear',
        'series',
        'slug',
      ]);
    });
  });

  describe('getModelsPaginated (admin)', () => {
    it('keeps the SEO overrides on the admin list', async () => {
      deviceRepositoryMock.findModels.mockResolvedValue({
        models: [{ ...mockModel, metaTitle: 'T', metaDescription: 'D', description: 'L' }],
        total: 1,
      });

      const result = await service.getModelsPaginated({});

      expect(result.items[0]).toMatchObject({
        metaTitle: 'T',
        metaDescription: 'D',
        description: 'L',
        brandName: 'Apple',
      });
    });
  });

  describe('createModel', () => {
    it('validates the owning brand exists', async () => {
      deviceRepositoryMock.findBrandById.mockResolvedValue(null);

      await expect(
        service.createModel({ deviceBrandId: 'ghost', name: 'iPhone 15 Pro' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(deviceRepositoryMock.createModel).not.toHaveBeenCalled();
    });

    it('creates a model and returns it with its brand name', async () => {
      deviceRepositoryMock.findBrandById.mockResolvedValue(mockBrand);
      deviceRepositoryMock.findModelBySlug.mockResolvedValue(null);
      deviceRepositoryMock.createModel.mockResolvedValue(mockModel);
      deviceRepositoryMock.findModelById.mockResolvedValue(mockModel);

      const result = await service.createModel({
        deviceBrandId: 'brand-1',
        name: 'iPhone 15 Pro',
      });

      expect(deviceRepositoryMock.createModel).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'iphone-15-pro', deviceBrandId: 'brand-1' }),
      );
      expect(result).toMatchObject({ id: 'model-1', brandName: 'Apple' });
    });

    it('purges the storefront model hubs, so a 404 cached for the new slug clears', async () => {
      deviceRepositoryMock.findBrandById.mockResolvedValue(mockBrand);
      deviceRepositoryMock.findModelBySlug.mockResolvedValue(null);
      deviceRepositoryMock.createModel.mockResolvedValue(mockModel);
      deviceRepositoryMock.findModelById.mockResolvedValue(mockModel);

      await service.createModel({ deviceBrandId: 'brand-1', name: 'iPhone 15 Pro' });

      expect(revalidationMock.revalidate).toHaveBeenCalledWith(DEVICE_HUBS_REVALIDATE_TARGET);
    });
  });

  // TASK-699: `/catalog/<категорія>/<модель>` is a public, indexed address (TASK-490),
  // so a model slug rename must leave a 308 behind — the same rule as a category
  // rename (plan 147 §Design Decision 3): only a model that was visible BEFORE the
  // write had a reachable URL worth redirecting.
  describe('updateModel (slug rename → redirect ledger, TASK-699)', () => {
    beforeEach(() => {
      deviceRepositoryMock.findModelBySlug.mockResolvedValue(null);
      deviceRepositoryMock.updateModel.mockResolvedValue(mockModel);
    });

    it('hands the repository the rename when an ACTIVE model changes its slug', async () => {
      deviceRepositoryMock.findModelById.mockResolvedValue(mockModel);

      await service.updateModel('model-1', { slug: 'iphone-15-pro-new' });

      expect(deviceRepositoryMock.updateModel).toHaveBeenCalledWith(
        'model-1',
        { slug: 'iphone-15-pro-new' },
        { oldSlug: 'iphone-15-pro', newSlug: 'iphone-15-pro-new' },
      );
    });

    it('still records it when the same write renames AND deactivates the model', async () => {
      // The PRE-write snapshot decides: the old URL was reachable until this call.
      deviceRepositoryMock.findModelById.mockResolvedValue(mockModel);

      await service.updateModel('model-1', { slug: 'iphone-15-pro-new', isActive: false });

      expect(deviceRepositoryMock.updateModel).toHaveBeenCalledWith(
        'model-1',
        { slug: 'iphone-15-pro-new', isActive: false },
        { oldSlug: 'iphone-15-pro', newSlug: 'iphone-15-pro-new' },
      );
    });

    it('records nothing for a model that was hidden — its URL never answered', async () => {
      deviceRepositoryMock.findModelById.mockResolvedValue({ ...mockModel, isActive: false });

      await service.updateModel('model-1', { slug: 'iphone-15-pro-new' });

      expect(deviceRepositoryMock.updateModel).toHaveBeenCalledWith(
        'model-1',
        { slug: 'iphone-15-pro-new' },
        undefined,
      );
    });

    it('records nothing when the slug is absent or unchanged', async () => {
      deviceRepositoryMock.findModelById.mockResolvedValue(mockModel);

      await service.updateModel('model-1', { name: 'iPhone 15 Pro (2023)' });
      await service.updateModel('model-1', { slug: 'iphone-15-pro' });

      expect(deviceRepositoryMock.updateModel).toHaveBeenNthCalledWith(
        1,
        'model-1',
        { name: 'iPhone 15 Pro (2023)' },
        undefined,
      );
      expect(deviceRepositoryMock.updateModel).toHaveBeenNthCalledWith(
        2,
        'model-1',
        { slug: 'iphone-15-pro' },
        undefined,
      );
    });

    it('rejects a slug another model already holds before writing anything', async () => {
      deviceRepositoryMock.findModelById.mockResolvedValue(mockModel);
      deviceRepositoryMock.findModelBySlug.mockResolvedValue({ ...mockModel, id: 'model-2' });

      await expect(
        service.updateModel('model-1', { slug: 'iphone-15-pro-max' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(deviceRepositoryMock.updateModel).not.toHaveBeenCalled();
    });
  });

  describe('setModelActive', () => {
    it('throws NotFoundException for an unknown model', async () => {
      deviceRepositoryMock.findModelById.mockResolvedValue(null);

      await expect(service.setModelActive('ghost', false)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(revalidationMock.revalidate).not.toHaveBeenCalled();
    });

    it('purges the storefront model hubs, so a hidden model 404s there (TASK-1954)', async () => {
      deviceRepositoryMock.findModelById.mockResolvedValue(mockModel);
      deviceRepositoryMock.updateModel.mockResolvedValue({ ...mockModel, isActive: false });

      await service.setModelActive('model-1', false);

      expect(revalidationMock.revalidate).toHaveBeenCalledWith(DEVICE_HUBS_REVALIDATE_TARGET);
    });

    it('never fails the write when the storefront purge throws', async () => {
      deviceRepositoryMock.findModelById.mockResolvedValue(mockModel);
      deviceRepositoryMock.updateModel.mockResolvedValue(mockModel);
      revalidationMock.revalidate.mockRejectedValueOnce(new Error('storefront down'));

      await expect(service.setModelActive('model-1', true)).resolves.toMatchObject({
        id: 'model-1',
      });
    });
  });

  describe('model-hub purge on other writes (TASK-1954)', () => {
    it('purges after a model edit', async () => {
      deviceRepositoryMock.findModelById.mockResolvedValue(mockModel);
      deviceRepositoryMock.updateModel.mockResolvedValue(mockModel);

      await service.updateModel('model-1', { metaTitle: 'Все для iPhone 15 Pro' });

      expect(revalidationMock.revalidate).toHaveBeenCalledWith(DEVICE_HUBS_REVALIDATE_TARGET);
    });

    it('purges after a brand edit — the hub shows the brand name', async () => {
      deviceRepositoryMock.findBrandById.mockResolvedValue(mockBrand);
      deviceRepositoryMock.updateBrand.mockResolvedValue({ ...mockBrand, name: 'Apple Inc.' });

      await service.updateBrand('brand-1', { name: 'Apple Inc.' });

      expect(revalidationMock.revalidate).toHaveBeenCalledWith(DEVICE_HUBS_REVALIDATE_TARGET);
    });

    it('does not purge on a rejected edit', async () => {
      deviceRepositoryMock.findModelById.mockResolvedValue(null);

      await expect(service.updateModel('ghost', { name: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(revalidationMock.revalidate).not.toHaveBeenCalled();
    });
  });

  // ─── reorderBrands (TASK-295) ─────────────────────────────────────────────

  describe('reorderBrands', () => {
    const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    it('returns the refreshed ADMIN list (with model counts) and logs the write', async () => {
      deviceRepositoryMock.reorderBrands.mockResolvedValue({
        brands: [
          { brand: { ...mockBrand, id: b, name: 'Samsung', slug: 'samsung' }, modelCount: 4 },
          { brand: { ...mockBrand, id: a }, modelCount: 7 },
        ],
        total: 2,
      });

      const result = await service.reorderBrands({ orderedIds: [b, a] }, 'admin-1');

      expect(deviceRepositoryMock.reorderBrands).toHaveBeenCalledWith([b, a]);
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toMatchObject({ id: b, modelCount: 4 });
      // Shape parity with the admin list — the panel writes this straight into its cache.
      expect(result.meta).toEqual({ total: 2, page: 1, limit: 2, totalPages: 1 });
      expect(pinoLoggerMock.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'device-brand.reorder', actorId: 'admin-1' }),
        expect.any(String),
      );
    });

    it('maps a duplicate id onto a 400 carrying the stable code', async () => {
      deviceRepositoryMock.reorderBrands.mockRejectedValue(new ReorderDuplicateIdError());

      await expect(service.reorderBrands({ orderedIds: [a, a] }, 'admin-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
