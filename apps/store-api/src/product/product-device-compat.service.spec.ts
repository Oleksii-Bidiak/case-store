import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CategoryRepository } from '../category';
import { DeviceRepository } from '../device';
import { ProductDeviceCompatRepository } from './product-device-compat.repository';
import {
  ProductDeviceCompatService,
  isCoverageHole,
  mentionsModel,
  productsChangedBy,
} from './product-device-compat.service';
import { ProductService } from './product.service';

const P1 = 'p1';
const P2 = 'p2';
const P3 = 'p3';

const product = (id: string, isActive = true) => ({ id, slug: `slug-${id}`, isActive });

describe('ProductDeviceCompatService (TASK-1955)', () => {
  let service: ProductDeviceCompatService;

  const compatRepository = {
    findLiveProducts: jest.fn(),
    getModelIdSetsByProductIds: jest.fn(),
    addCompat: jest.fn(),
    removeCompat: jest.fn(),
    replaceCompat: jest.fn(),
    countByRootCategory: jest.fn(),
    countModelProducts: jest.fn(),
    findNameCandidatesWithoutModel: jest.fn(),
  };
  const deviceRepository = {
    findModelsByIds: jest.fn(),
    findModelsBySeries: jest.fn(),
    findModelById: jest.fn(),
  };
  const categoryRepository = { findByIds: jest.fn() };
  const productService = { afterDeviceCompatWrite: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    compatRepository.findLiveProducts.mockImplementation((ids: string[]) =>
      Promise.resolve(ids.map((id) => product(id))),
    );
    compatRepository.getModelIdSetsByProductIds.mockResolvedValue(new Map());
    compatRepository.addCompat.mockResolvedValue(0);
    compatRepository.removeCompat.mockResolvedValue(0);
    compatRepository.replaceCompat.mockResolvedValue({ added: 0, removed: 0 });
    deviceRepository.findModelsByIds.mockImplementation((ids: string[]) =>
      Promise.resolve(ids.map((id) => ({ id }))),
    );
    deviceRepository.findModelsBySeries.mockResolvedValue([]);
    productService.afterDeviceCompatWrite.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductDeviceCompatService,
        { provide: ProductDeviceCompatRepository, useValue: compatRepository },
        { provide: DeviceRepository, useValue: deviceRepository },
        { provide: CategoryRepository, useValue: categoryRepository },
        { provide: ProductService, useValue: productService },
      ],
    }).compile();
    service = module.get(ProductDeviceCompatService);
  });

  describe('bulkUpdate', () => {
    it('add links the models to every product that lacks one, and purges only those', async () => {
      compatRepository.getModelIdSetsByProductIds.mockResolvedValue(
        new Map([[P2, new Set(['m1', 'm2'])]]),
      );
      compatRepository.addCompat.mockResolvedValue(2);

      const result = await service.bulkUpdate({
        productIds: [P1, P2],
        mode: 'add',
        deviceModelIds: ['m1', 'm2'],
      });

      expect(compatRepository.addCompat).toHaveBeenCalledWith([P1], ['m1', 'm2']);
      expect(result).toEqual({ updatedProducts: 1, added: 2, removed: 0 });
      expect(productService.afterDeviceCompatWrite).toHaveBeenCalledWith([product(P1)]);
    });

    it('add is idempotent: a re-run writes nothing and purges nothing', async () => {
      compatRepository.getModelIdSetsByProductIds.mockResolvedValue(
        new Map([[P1, new Set(['m1'])]]),
      );

      const result = await service.bulkUpdate({
        productIds: [P1],
        mode: 'add',
        deviceModelIds: ['m1'],
      });

      expect(result).toEqual({ updatedProducts: 0, added: 0, removed: 0 });
      expect(compatRepository.addCompat).not.toHaveBeenCalled();
      expect(productService.afterDeviceCompatWrite).not.toHaveBeenCalled();
    });

    it('remove unlinks only from the products that have one of the models', async () => {
      compatRepository.getModelIdSetsByProductIds.mockResolvedValue(
        new Map([
          [P1, new Set(['m1', 'm9'])],
          [P2, new Set(['m9'])],
        ]),
      );
      compatRepository.removeCompat.mockResolvedValue(1);

      const result = await service.bulkUpdate({
        productIds: [P1, P2],
        mode: 'remove',
        deviceModelIds: ['m1'],
      });

      expect(compatRepository.removeCompat).toHaveBeenCalledWith([P1], ['m1']);
      expect(result).toEqual({ updatedProducts: 1, added: 0, removed: 1 });
    });

    it('replace goes through the repository transaction and reports both counts', async () => {
      compatRepository.getModelIdSetsByProductIds.mockResolvedValue(
        new Map([
          [P1, new Set(['m9'])],
          [P2, new Set(['m1'])],
        ]),
      );
      compatRepository.replaceCompat.mockResolvedValue({ added: 2, removed: 1 });

      const result = await service.bulkUpdate({
        productIds: [P1, P2, P3],
        mode: 'replace',
        deviceModelIds: ['m1'],
      });

      // P2 already has exactly {m1}: untouched.
      expect(compatRepository.replaceCompat).toHaveBeenCalledWith([P1, P3], ['m1']);
      expect(compatRepository.addCompat).not.toHaveBeenCalled();
      expect(compatRepository.removeCompat).not.toHaveBeenCalled();
      expect(result).toEqual({ updatedProducts: 2, added: 2, removed: 1 });
      expect(productService.afterDeviceCompatWrite).toHaveBeenCalledWith([
        product(P1),
        product(P3),
      ]);
    });

    it('expands a series to all its models (active and inactive) and merges direct ids', async () => {
      deviceRepository.findModelsBySeries.mockResolvedValue([
        { id: 'm1', series: 'iPhone 15', isActive: true },
        { id: 'm2', series: 'iPhone 15', isActive: false },
      ]);
      compatRepository.addCompat.mockResolvedValue(3);

      await service.bulkUpdate({
        productIds: [P1],
        mode: 'add',
        deviceModelIds: ['m1', 'm7'],
        series: ['iPhone 15'],
      });

      expect(deviceRepository.findModelsBySeries).toHaveBeenCalledWith(['iPhone 15']);
      expect(compatRepository.addCompat).toHaveBeenCalledWith([P1], ['m1', 'm7', 'm2']);
    });

    it.each(['add', 'remove', 'replace'] as const)(
      '%s with no model after expansion is a 400 before any read of products',
      async (mode) => {
        await expect(
          service.bulkUpdate({ productIds: [P1], mode, deviceModelIds: [], series: [] }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(compatRepository.findLiveProducts).not.toHaveBeenCalled();
      },
    );

    it('rejects an unknown model id with a 400, writing nothing', async () => {
      deviceRepository.findModelsByIds.mockResolvedValue([{ id: 'm1' }]);

      await expect(
        service.bulkUpdate({ productIds: [P1], mode: 'add', deviceModelIds: ['m1', 'ghost'] }),
      ).rejects.toThrow(/ghost/);
      expect(compatRepository.addCompat).not.toHaveBeenCalled();
    });

    it('rejects a series with no model with a 400', async () => {
      deviceRepository.findModelsBySeries.mockResolvedValue([{ id: 'm1', series: 'iPhone 15' }]);

      await expect(
        service.bulkUpdate({ productIds: [P1], mode: 'add', series: ['iPhone 15', 'Nokia 3310'] }),
      ).rejects.toThrow(/Nokia 3310/);
    });

    it('rejects an unknown (or deleted) product id with a 400, writing nothing', async () => {
      compatRepository.findLiveProducts.mockResolvedValue([product(P1)]);

      await expect(
        service.bulkUpdate({ productIds: [P1, P2], mode: 'add', deviceModelIds: ['m1'] }),
      ).rejects.toThrow(/p2/);
      expect(compatRepository.addCompat).not.toHaveBeenCalled();
      expect(productService.afterDeviceCompatWrite).not.toHaveBeenCalled();
    });
  });

  describe('getModelCoverage', () => {
    const model = {
      id: 'm-pro',
      name: 'iPhone 15 Pro',
      slug: 'iphone-15-pro',
      series: 'iPhone 15',
      deviceBrandId: 'b-apple',
      isActive: true,
      brand: { name: 'Apple' },
    };

    beforeEach(() => {
      deviceRepository.findModelById.mockResolvedValue(model);
      deviceRepository.findModelsBySeries.mockResolvedValue([
        model,
        { id: 'm-max', name: 'iPhone 15 Pro Max', deviceBrandId: 'b-apple', isActive: true },
        { id: 'm-base', name: 'iPhone 15', deviceBrandId: 'b-apple', isActive: true },
        { id: 'm-off', name: 'iPhone 15 Mini', deviceBrandId: 'b-apple', isActive: false },
        { id: 'm-other', name: 'iPhone 15 Clone', deviceBrandId: 'b-x', isActive: true },
      ]);
      compatRepository.countModelProducts.mockResolvedValue({
        compatibleProducts: 5,
        inStockProducts: 4,
      });
      compatRepository.findNameCandidatesWithoutModel.mockResolvedValue([]);
      compatRepository.countByRootCategory.mockResolvedValue([
        { rootCategoryId: 'c-cases', deviceModelId: 'm-pro', productCount: 5 },
        { rootCategoryId: 'c-cases', deviceModelId: 'm-base', productCount: 6 },
        { rootCategoryId: 'c-books', deviceModelId: 'm-base', productCount: 2 },
        { rootCategoryId: 'c-glass', deviceModelId: 'm-max', productCount: 1 },
      ]);
      categoryRepository.findByIds.mockResolvedValue([
        { id: 'c-glass', name: 'Скло', slug: 'glass', icon: 'glass', sortOrder: 2 },
        { id: 'c-cases', name: 'Чохли', slug: 'cases', icon: 'cases', sortOrder: 0 },
        { id: 'c-books', name: 'Книжки', slug: 'books', icon: 'nope', sortOrder: 1 },
      ]);
    });

    it('404s an unknown model', async () => {
      deviceRepository.findModelById.mockResolvedValue(null);
      await expect(service.getModelCoverage('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('takes active siblings of the same brand and series, sorted, without itself', async () => {
      const coverage = await service.getModelCoverage('m-pro');

      expect(coverage.siblings).toEqual([
        { id: 'm-base', name: 'iPhone 15' },
        { id: 'm-max', name: 'iPhone 15 Pro Max' },
      ]);
      expect(compatRepository.countByRootCategory).toHaveBeenCalledWith([
        'm-pro',
        'm-base',
        'm-max',
      ]);
    });

    it('builds a full matrix in tree order and counts holes', async () => {
      const coverage = await service.getModelCoverage('m-pro');

      expect(coverage.categories.map((c) => c.id)).toEqual(['c-cases', 'c-books', 'c-glass']);
      expect(coverage.categories[1].counts).toEqual([
        { deviceModelId: 'm-pro', productCount: 0 },
        { deviceModelId: 'm-base', productCount: 2 },
        { deviceModelId: 'm-max', productCount: 0 },
      ]);
      // An unknown icon key is served as null, like everywhere else.
      expect(coverage.categories[1].icon).toBeNull();
      expect(coverage.stats).toEqual({ compatibleProducts: 5, inStockProducts: 4, holes: 2 });
      expect(coverage.model).toEqual({
        id: 'm-pro',
        name: 'iPhone 15 Pro',
        slug: 'iphone-15-pro',
        series: 'iPhone 15',
        brandName: 'Apple',
        isActive: true,
      });
    });

    it('has no siblings and no holes for a model without a series', async () => {
      deviceRepository.findModelById.mockResolvedValue({ ...model, series: null });
      compatRepository.countByRootCategory.mockResolvedValue([]);
      categoryRepository.findByIds.mockResolvedValue([]);

      const coverage = await service.getModelCoverage('m-pro');

      expect(deviceRepository.findModelsBySeries).not.toHaveBeenCalled();
      expect(coverage.siblings).toEqual([]);
      expect(coverage.stats.holes).toBe(0);
    });

    it('keeps only suspects that name the model itself, at most ten', async () => {
      compatRepository.findNameCandidatesWithoutModel.mockResolvedValue([
        { id: 's1', name: 'Захист камери для iPhone 15 Pro / Pro Max', slug: 's1' },
        { id: 's2', name: 'Чохол iPhone 15 Pro Max', slug: 's2' },
        ...Array.from({ length: 12 }, (_, i) => ({
          id: `x${i}`,
          name: `Скло iPhone 15 Pro ${i}`,
          slug: `x${i}`,
        })),
      ]);

      const coverage = await service.getModelCoverage('m-pro');

      expect(coverage.suspects).toHaveLength(10);
      expect(coverage.suspects[0].id).toBe('s1');
      expect(coverage.suspects.map((s) => s.id)).not.toContain('s2');
    });
  });
});

describe('productsChangedBy', () => {
  const current = new Map([
    ['a', new Set(['m1'])],
    ['b', new Set(['m1', 'm2'])],
  ]);

  it('add: products missing any model', () => {
    expect(productsChangedBy('add', ['a', 'b', 'c'], ['m1', 'm2'], current)).toEqual(['a', 'c']);
  });

  it('remove: products holding any model', () => {
    expect(productsChangedBy('remove', ['a', 'b', 'c'], ['m2'], current)).toEqual(['b']);
  });

  it('replace: products whose set differs', () => {
    expect(productsChangedBy('replace', ['a', 'b', 'c'], ['m1'], current)).toEqual(['b', 'c']);
  });
});

describe('isCoverageHole', () => {
  const cell = (deviceModelId: string, productCount: number) => ({ deviceModelId, productCount });

  it('is a hole when the model has 0 and a sibling has some', () => {
    expect(isCoverageHole({ counts: [cell('me', 0), cell('s', 3)] })).toBe(true);
  });

  it('is not a hole when the model has products', () => {
    expect(isCoverageHole({ counts: [cell('me', 1), cell('s', 3)] })).toBe(false);
  });

  it('is not a hole without siblings to compare with', () => {
    expect(isCoverageHole({ counts: [cell('me', 0)] })).toBe(false);
  });
});

describe('mentionsModel', () => {
  it.each([
    ['Скло для iPhone 15 Pro', 'iPhone 15 Pro', true],
    ['скло для IPHONE 15 PRO', 'iPhone 15 Pro', true],
    ['Чохол iPhone 15 Pro Max', 'iPhone 15 Pro', false],
    ['Чохол iPhone 15 Pro Max і iPhone 15 Pro', 'iPhone 15 Pro', true],
    ['Чохол iPhone 15', 'iPhone 1', false],
    ['Чохол Galaxy S24 Ultra', 'Galaxy S24', false],
    ['Кабель для iPhone 15/15 Pro', 'iPhone 15', true],
    ['Чохол Samsung', 'iPhone 15', false],
  ])('%s mentions %s → %s', (name, model, expected) => {
    expect(mentionsModel(name, model)).toBe(expected);
  });
});
