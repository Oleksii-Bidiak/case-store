import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CategoryRepository } from '../category/category.repository';
import { DeviceRepository } from '../device/device.repository';
import { ProductService } from '../product/product.service';
import { CatalogLandingRepository } from './catalog-landing.repository';
import { DEVICE_HUB_PRODUCTS_PER_GROUP, DeviceHubService } from './device-hub.service';

/**
 * Unit cover for the model hub (TASK-1954). The visibility scope, the root
 * grouping and the per-group cap need real rows and are pinned by
 * `test/device-hub.int-spec.ts`; here: the bookkeeping around the one windowed
 * read — every way of "no hub" is one NotFoundException, groups are ordered by
 * the category's sortOrder then name, cards keep the rank order, and the query
 * budget does not grow with the number of groups.
 */
describe('DeviceHubService', () => {
  let service: DeviceHubService;

  const landingRepository = { findDeviceHubRows: jest.fn() };
  const categoryRepository = { findByIds: jest.fn() };
  const deviceRepository = { findModelBySlugWithBrand: jest.fn() };
  const productService = { getCardsByIds: jest.fn() };

  const model = (isActive = true) => ({
    id: 'model-1',
    deviceBrandId: 'brand-1',
    name: 'iPhone 15 Pro',
    slug: 'iphone-15-pro',
    series: 'iPhone 15',
    releaseYear: 2023,
    isActive,
    metaTitle: 'Аксесуари для iPhone 15 Pro',
    metaDescription: null,
    description: null,
    brand: { name: 'Apple', slug: 'apple' },
  });
  const category = (
    id: string,
    name: string,
    sortOrder: number,
    isActive = true,
    icon: string | null = null,
  ) => ({
    id,
    name,
    slug: id,
    sortOrder,
    isActive,
    icon,
    deletedAt: null,
  });
  const card = (id: string) => ({ id, slug: id, compatibleDeviceModelIds: ['model-1'] });
  const row = (groupCategoryId: string, productId: string, rank: number, productCount: number) => ({
    groupCategoryId,
    productId,
    rank,
    productCount,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceHubService,
        { provide: CatalogLandingRepository, useValue: landingRepository },
        { provide: CategoryRepository, useValue: categoryRepository },
        { provide: DeviceRepository, useValue: deviceRepository },
        { provide: ProductService, useValue: productService },
      ],
    }).compile();
    service = moduleRef.get(DeviceHubService);
  });

  describe('404 — every way of "there is no hub"', () => {
    it('unknown model', async () => {
      deviceRepository.findModelBySlugWithBrand.mockResolvedValue(null);

      await expect(service.getDeviceHub('ghost')).rejects.toBeInstanceOf(NotFoundException);
      expect(landingRepository.findDeviceHubRows).not.toHaveBeenCalled();
    });

    it('deactivated model', async () => {
      deviceRepository.findModelBySlugWithBrand.mockResolvedValue(model(false));

      await expect(service.getDeviceHub('iphone-15-pro')).rejects.toBeInstanceOf(NotFoundException);
      expect(landingRepository.findDeviceHubRows).not.toHaveBeenCalled();
    });

    it('active model with no visible compatible product', async () => {
      deviceRepository.findModelBySlugWithBrand.mockResolvedValue(model());
      landingRepository.findDeviceHubRows.mockResolvedValue([]);

      await expect(service.getDeviceHub('iphone-15-pro')).rejects.toBeInstanceOf(NotFoundException);
      expect(productService.getCardsByIds).not.toHaveBeenCalled();
    });

    it('every group category was withdrawn between the two reads', async () => {
      deviceRepository.findModelBySlugWithBrand.mockResolvedValue(model());
      landingRepository.findDeviceHubRows.mockResolvedValue([row('cases', 'p1', 1, 1)]);
      categoryRepository.findByIds.mockResolvedValue([category('cases', 'Чохли', 0, false)]);
      productService.getCardsByIds.mockResolvedValue([card('p1')]);

      await expect(service.getDeviceHub('iphone-15-pro')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('builds the hub: model, total, groups by sortOrder then name, cards in rank order', async () => {
    deviceRepository.findModelBySlugWithBrand.mockResolvedValue(model());
    landingRepository.findDeviceHubRows.mockResolvedValue([
      row('chargers', 'c1', 1, 3),
      row('cases', 'k2', 1, 12),
      row('cases', 'k1', 2, 12),
      row('cables', 'w1', 1, 1),
    ]);
    // Returned in an arbitrary order — the service sorts.
    categoryRepository.findByIds.mockResolvedValue([
      // A key retired from the sprite reads as null, never as an off-contract string.
      category('chargers', 'Зарядні пристрої', 2, true, 'retired-icon'),
      category('cables', 'Кабелі', 2),
      category('cases', 'Чохли', 0, true, 'cases'),
    ]);
    // Cards come back in their own order; the service restores the rank order.
    productService.getCardsByIds.mockResolvedValue([
      card('k1'),
      card('w1'),
      card('k2'),
      card('c1'),
    ]);

    const hub = await service.getDeviceHub('iphone-15-pro');

    expect(deviceRepository.findModelBySlugWithBrand).toHaveBeenCalledWith('iphone-15-pro');
    expect(landingRepository.findDeviceHubRows).toHaveBeenCalledWith(
      'model-1',
      DEVICE_HUB_PRODUCTS_PER_GROUP,
    );
    expect(hub.model).toEqual({
      id: 'model-1',
      name: 'iPhone 15 Pro',
      slug: 'iphone-15-pro',
      brandName: 'Apple',
      brandSlug: 'apple',
      series: 'iPhone 15',
      metaTitle: 'Аксесуари для iPhone 15 Pro',
      metaDescription: null,
      description: null,
    });
    expect(hub.productCount).toBe(16);
    // sortOrder 0 first; the two sortOrder-2 groups by name («Зарядні» < «Кабелі»).
    expect(hub.groups.map((group) => group.category.slug)).toEqual(['cases', 'chargers', 'cables']);
    expect(hub.groups.map((group) => group.category.icon)).toEqual(['cases', null, null]);
    expect(hub.groups[0]).toEqual({
      category: { id: 'cases', name: 'Чохли', slug: 'cases', icon: 'cases' },
      productCount: 12,
      products: [card('k2'), card('k1')],
    });
  });

  it('keeps the query budget fixed: one rows read, one category read, one card hydration', async () => {
    deviceRepository.findModelBySlugWithBrand.mockResolvedValue(model());
    const groups = ['a', 'b', 'c', 'd', 'e', 'f'];
    landingRepository.findDeviceHubRows.mockResolvedValue(
      groups.flatMap((g) => [row(g, `${g}1`, 1, 2), row(g, `${g}2`, 2, 2)]),
    );
    categoryRepository.findByIds.mockResolvedValue(groups.map((g, i) => category(g, g, i)));
    productService.getCardsByIds.mockImplementation(async (ids: string[]) => ids.map(card));

    const hub = await service.getDeviceHub('iphone-15-pro');

    expect(hub.groups).toHaveLength(6);
    expect(landingRepository.findDeviceHubRows).toHaveBeenCalledTimes(1);
    expect(categoryRepository.findByIds).toHaveBeenCalledTimes(1);
    expect(categoryRepository.findByIds).toHaveBeenCalledWith(groups);
    expect(productService.getCardsByIds).toHaveBeenCalledTimes(1);
    expect(productService.getCardsByIds).toHaveBeenCalledWith(
      groups.flatMap((g) => [`${g}1`, `${g}2`]),
    );
  });

  it('drops a card the hydration no longer returns (hidden in between), keeping the group', async () => {
    deviceRepository.findModelBySlugWithBrand.mockResolvedValue(model());
    landingRepository.findDeviceHubRows.mockResolvedValue([
      row('cases', 'k1', 1, 2),
      row('cases', 'k2', 2, 2),
    ]);
    categoryRepository.findByIds.mockResolvedValue([category('cases', 'Чохли', 0)]);
    productService.getCardsByIds.mockResolvedValue([card('k2')]);

    const hub = await service.getDeviceHub('iphone-15-pro');

    expect(hub.groups[0].products).toEqual([card('k2')]);
  });
});
