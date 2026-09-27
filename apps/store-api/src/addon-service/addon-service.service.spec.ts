import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AddonDeltaType } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AddonServiceService } from './addon-service.service';
import { AddonServiceRepository } from './addon-service.repository';
import { AddonApplicabilityResolver } from './addon-applicability.resolver';
import { CategoryRepository } from '../category';
import { ProductRepository } from '../product';
import { SetProductDeltaDto, AddonServiceListQueryDto } from './dto';
import { RevalidationNotifier } from '../publishing';
import { ADDON_SERVICES_TAG } from './addon-service.service';

const service = {
  id: 'svc-a',
  name: 'Warranty',
  description: null,
  price: '499',
  isActive: true,
  createdAt: new Date('2026-07-01'),
  updatedAt: new Date('2026-07-01'),
};

describe('AddonServiceService (TASK-174)', () => {
  let addonServiceService: AddonServiceService;

  const repository = {
    findById: jest.fn(),
    findAllActive: jest.fn(),
    findAllAdmin: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    setActive: jest.fn(),
    findCategoryTemplateRows: jest.fn(),
    replaceCategoryTemplate: jest.fn(),
    findProductDeltaRows: jest.fn(),
    upsertProductDelta: jest.fn(),
    clearProductDelta: jest.fn(),
  };
  const resolver = { resolveForProduct: jest.fn(), resolveTemplateForCategory: jest.fn() };
  const categoryRepository = { findById: jest.fn() };
  const productRepository = { findById: jest.fn(), findPublicById: jest.fn() };
  const revalidation = { revalidate: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddonServiceService,
        { provide: AddonServiceRepository, useValue: repository },
        { provide: AddonApplicabilityResolver, useValue: resolver },
        { provide: CategoryRepository, useValue: categoryRepository },
        { provide: ProductRepository, useValue: productRepository },
        { provide: RevalidationNotifier, useValue: revalidation },
      ],
    }).compile();
    addonServiceService = module.get(AddonServiceService);
  });

  // TASK-561 — the storefront /info lists these; a write must reach it.
  describe('public active list', () => {
    it('maps the active services to the public shape — no isActive, no timestamps', async () => {
      repository.findAllActive.mockResolvedValue([service]);

      expect(await addonServiceService.findPublicActive()).toEqual([
        { id: 'svc-a', name: 'Warranty', description: null, price: '499.00' },
      ]);
    });

    it.each([
      ['create', () => addonServiceService.create({ name: 'Warranty', price: 499 })],
      ['update', () => addonServiceService.update('svc-a', { price: 599 })],
      ['setActive', () => addonServiceService.setActive('svc-a', false)],
    ])('purges the storefront add-on tag after %s', async (_name, write) => {
      repository.findById.mockResolvedValue(service);
      repository.create.mockResolvedValue(service);
      repository.update.mockResolvedValue(service);
      repository.setActive.mockResolvedValue(service);

      await write();

      expect(revalidation.revalidate).toHaveBeenCalledWith({ tags: [ADDON_SERVICES_TAG] });
    });

    it('does not purge anything when the service does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(addonServiceService.update('missing', { price: 1 })).rejects.toThrow();
      expect(revalidation.revalidate).not.toHaveBeenCalled();
    });
  });

  describe('catalog CRUD', () => {
    it('pads the price to two decimals on create ("499" → "499.00")', async () => {
      repository.create.mockResolvedValue(service);

      const created = await addonServiceService.create({ name: 'Warranty', price: 499 });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ price: '499.00', description: null }),
      );
      expect(created.price).toBe('499.00');
    });

    it('leaves the price untouched on update when the DTO omits it', async () => {
      repository.findById.mockResolvedValue(service);
      repository.update.mockResolvedValue(service);

      await addonServiceService.update('svc-a', { name: 'Renamed' });

      expect(repository.update).toHaveBeenCalledWith(
        'svc-a',
        expect.objectContaining({ name: 'Renamed', price: undefined }),
      );
    });

    it('404s on update / status-toggle of an unknown service', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(addonServiceService.update('ghost', { name: 'x' })).rejects.toThrow(
        NotFoundException,
      );
      await expect(addonServiceService.setActive('ghost', false)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.update).not.toHaveBeenCalled();
      expect(repository.setActive).not.toHaveBeenCalled();
    });
  });

  describe('category templates', () => {
    it('full-replaces the own template and echoes back the persisted ids', async () => {
      categoryRepository.findById.mockResolvedValue({ id: 'cat-1', name: 'Смартфони' });
      repository.findById.mockResolvedValue(service);
      repository.findCategoryTemplateRows.mockResolvedValue([{ addonServiceId: 'svc-a' }]);

      const result = await addonServiceService.setCategoryTemplate('cat-1', {
        addonServiceIds: ['svc-a'],
      });

      expect(repository.replaceCategoryTemplate).toHaveBeenCalledWith('cat-1', ['svc-a']);
      expect(result).toEqual({ addonServiceIds: ['svc-a'] });
    });

    it('accepts an EMPTY list — clearing the own template is a valid operation', async () => {
      categoryRepository.findById.mockResolvedValue({ id: 'cat-1', name: 'Смартфони' });
      repository.findCategoryTemplateRows.mockResolvedValue([]);

      const result = await addonServiceService.setCategoryTemplate('cat-1', {
        addonServiceIds: [],
      });

      expect(repository.replaceCategoryTemplate).toHaveBeenCalledWith('cat-1', []);
      expect(result).toEqual({ addonServiceIds: [] });
    });

    it('rejects an unknown service id BEFORE writing anything (validate-before-write)', async () => {
      categoryRepository.findById.mockResolvedValue({ id: 'cat-1', name: 'Смартфони' });
      repository.findById.mockResolvedValue(null);

      await expect(
        addonServiceService.setCategoryTemplate('cat-1', { addonServiceIds: ['ghost'] }),
      ).rejects.toThrow(BadRequestException);
      expect(repository.replaceCategoryTemplate).not.toHaveBeenCalled();
    });

    it('404s for an unknown category', async () => {
      categoryRepository.findById.mockResolvedValue(null);

      await expect(
        addonServiceService.setCategoryTemplate('ghost', { addonServiceIds: [] }),
      ).rejects.toThrow(NotFoundException);
    });

    it('resolves the template source and names the category it was inherited from', async () => {
      categoryRepository.findById
        .mockResolvedValueOnce({ id: 'cat-child', name: 'iPhone' })
        .mockResolvedValueOnce({ id: 'cat-root', name: 'Смартфони' });
      resolver.resolveTemplateForCategory.mockResolvedValue({
        source: 'inherited',
        sourceCategoryId: 'cat-root',
        addons: [],
      });

      const resolved = await addonServiceService.resolveTemplateForCategory('cat-child');

      expect(resolved.source).toBe('inherited');
      expect(resolved.sourceCategoryName).toBe('Смартфони');
    });
  });

  describe('resolved add-ons for a product (TASK-781)', () => {
    const product = { id: 'p1', categoryId: 'cat-1', deletedAt: null };
    const resolvedAddon = {
      addonServiceId: 'svc-a',
      name: 'Warranty',
      description: null,
      price: '499.00',
      source: 'inherited',
    };

    it('public: resolves only a publicly visible product (the shared predicate read)', async () => {
      productRepository.findPublicById.mockResolvedValue(product);
      resolver.resolveForProduct.mockResolvedValue([resolvedAddon]);

      const addons = await addonServiceService.resolveForProduct('p1');

      expect(productRepository.findPublicById).toHaveBeenCalledWith('p1');
      expect(productRepository.findById).not.toHaveBeenCalled();
      expect(addons).toHaveLength(1);
    });

    it('public: a draft / hidden product answers 404 exactly like a nonexistent id — no prices leak', async () => {
      productRepository.findPublicById.mockResolvedValue(null);

      await expect(addonServiceService.resolveForProduct('draft-1')).rejects.toThrow(
        new NotFoundException('Product not found'),
      );
      expect(resolver.resolveForProduct).not.toHaveBeenCalled();
    });

    it('admin: resolves a draft too — the operator configures add-ons before publishing', async () => {
      productRepository.findById.mockResolvedValue({ ...product, isActive: false });
      resolver.resolveForProduct.mockResolvedValue([resolvedAddon]);

      const addons = await addonServiceService.resolveForProductForAdmin('p1');

      expect(productRepository.findById).toHaveBeenCalledWith('p1');
      expect(productRepository.findPublicById).not.toHaveBeenCalled();
      expect(addons).toHaveLength(1);
    });

    it('admin: still 404 for a missing or soft-deleted product', async () => {
      productRepository.findById.mockResolvedValue(null);

      await expect(addonServiceService.resolveForProductForAdmin('gone')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('product deltas', () => {
    const product = { id: 'p1', categoryId: 'cat-1', deletedAt: null };

    it('normalises the delta price to a two-decimal string', async () => {
      productRepository.findById.mockResolvedValue(product);
      repository.findById.mockResolvedValue(service);
      repository.upsertProductDelta.mockResolvedValue({
        id: 'd1',
        productId: 'p1',
        addonServiceId: 'svc-a',
        type: AddonDeltaType.OVERRIDE,
        price: '1299.00',
        addonService: service,
      });

      const delta = await addonServiceService.setProductDelta('p1', 'svc-a', {
        type: AddonDeltaType.OVERRIDE,
        price: 1299,
      });

      expect(repository.upsertProductDelta).toHaveBeenCalledWith(
        'p1',
        'svc-a',
        AddonDeltaType.OVERRIDE,
        '1299.00',
      );
      expect(delta.price).toBe('1299.00');
    });

    it('always stores a null price for a REMOVE delta, whatever the client sent', async () => {
      productRepository.findById.mockResolvedValue(product);
      repository.findById.mockResolvedValue(service);
      repository.upsertProductDelta.mockResolvedValue({
        id: 'd1',
        productId: 'p1',
        addonServiceId: 'svc-a',
        type: AddonDeltaType.REMOVE,
        price: null,
        addonService: service,
      });

      await addonServiceService.setProductDelta('p1', 'svc-a', {
        type: AddonDeltaType.REMOVE,
        price: 999,
      });

      expect(repository.upsertProductDelta).toHaveBeenCalledWith(
        'p1',
        'svc-a',
        AddonDeltaType.REMOVE,
        null,
      );
    });

    it('stores a null price for an ADD delta with no explicit price (use the catalog price)', async () => {
      productRepository.findById.mockResolvedValue(product);
      repository.findById.mockResolvedValue(service);
      repository.upsertProductDelta.mockResolvedValue({
        id: 'd1',
        productId: 'p1',
        addonServiceId: 'svc-a',
        type: AddonDeltaType.ADD,
        price: null,
        addonService: service,
      });

      await addonServiceService.setProductDelta('p1', 'svc-a', { type: AddonDeltaType.ADD });

      expect(repository.upsertProductDelta).toHaveBeenCalledWith(
        'p1',
        'svc-a',
        AddonDeltaType.ADD,
        null,
      );
    });

    it('404s for an unknown / soft-deleted product and for an unknown service', async () => {
      productRepository.findById.mockResolvedValue(null);
      await expect(
        addonServiceService.setProductDelta('ghost', 'svc-a', { type: AddonDeltaType.REMOVE }),
      ).rejects.toThrow(NotFoundException);

      productRepository.findById.mockResolvedValue({ ...product, deletedAt: new Date() });
      await expect(
        addonServiceService.setProductDelta('p1', 'svc-a', { type: AddonDeltaType.REMOVE }),
      ).rejects.toThrow(NotFoundException);

      productRepository.findById.mockResolvedValue(product);
      repository.findById.mockResolvedValue(null);
      await expect(
        addonServiceService.setProductDelta('p1', 'ghost', { type: AddonDeltaType.REMOVE }),
      ).rejects.toThrow(NotFoundException);
    });

    it('clearing a delta is idempotent (no 404 when there is nothing to clear)', async () => {
      productRepository.findById.mockResolvedValue(product);

      await expect(addonServiceService.clearProductDelta('p1', 'svc-a')).resolves.toBeUndefined();
      expect(repository.clearProductDelta).toHaveBeenCalledWith('p1', 'svc-a');
    });
  });

  // ─── DTO-level rules ───────────────────────────────────────────────────────

  describe('SetProductDeltaDto validation', () => {
    const validateDto = (plain: Record<string, unknown>) =>
      validate(plainToInstance(SetProductDeltaDto, plain));

    it('requires a price for OVERRIDE', async () => {
      const errors = await validateDto({ type: 'OVERRIDE' });
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('price');
    });

    it('rejects a price for REMOVE', async () => {
      const errors = await validateDto({ type: 'REMOVE', price: 10 });
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('price');
    });

    it('accepts ADD with and without a price, and OVERRIDE with one', async () => {
      expect(await validateDto({ type: 'ADD' })).toHaveLength(0);
      expect(await validateDto({ type: 'ADD', price: 150 })).toHaveLength(0);
      expect(await validateDto({ type: 'OVERRIDE', price: 0 })).toHaveLength(0);
      expect(await validateDto({ type: 'REMOVE' })).toHaveLength(0);
    });

    it('rejects a negative price and an unknown delta type', async () => {
      expect(await validateDto({ type: 'ADD', price: -1 })).toHaveLength(1);
      expect(await validateDto({ type: 'NOPE' })).not.toHaveLength(0);
    });
  });

  describe('AddonServiceListQueryDto boolean coercion (memory: boolean-query-dto gotcha)', () => {
    it('does not coerce ?isActive=false into `true`', () => {
      const dto = plainToInstance(
        AddonServiceListQueryDto,
        { isActive: 'false' },
        { enableImplicitConversion: true },
      );
      expect(dto.isActive).toBe(false);
    });

    it('still reads ?isActive=true as `true`', () => {
      const dto = plainToInstance(
        AddonServiceListQueryDto,
        { isActive: 'true' },
        { enableImplicitConversion: true },
      );
      expect(dto.isActive).toBe(true);
    });
  });
});
