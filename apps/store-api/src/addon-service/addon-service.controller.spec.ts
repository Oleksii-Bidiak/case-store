import { Test, TestingModule } from '@nestjs/testing';
import { AddonDeltaType } from '@prisma/client';
import { AddonServiceController } from './addon-service.controller';
import { AdminAddonServiceController } from './admin-addon-service.controller';
import { AddonServiceService } from './addon-service.service';
import { PermissionGuard } from '../auth/permissions';

/**
 * Controller-level unit tests (TASK-174): every route delegates to the service
 * and wraps the result in the `{ data }` envelope; no business logic leaks into
 * the controller layer. The admin controller is additionally pinned to the
 * `PermissionGuard` — the public one must carry no guard at all.
 */
describe('AddonService controllers (TASK-174)', () => {
  let publicController: AddonServiceController;
  let adminController: AdminAddonServiceController;

  const addonServiceService = {
    resolveForProduct: jest.fn(),
    findAllAdmin: jest.fn(),
    findAllActive: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    setActive: jest.fn(),
    findCategoryTemplate: jest.fn(),
    setCategoryTemplate: jest.fn(),
    resolveTemplateForCategory: jest.fn(),
    findProductDeltas: jest.fn(),
    setProductDelta: jest.fn(),
    clearProductDelta: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AddonServiceController, AdminAddonServiceController],
      providers: [{ provide: AddonServiceService, useValue: addonServiceService }],
    })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    publicController = module.get(AddonServiceController);
    adminController = module.get(AdminAddonServiceController);
  });

  describe('public', () => {
    it('GET /addon-services/resolved-for-product/:productId returns the resolved list', async () => {
      const addons = [{ addonServiceId: 'svc-a', name: 'Warranty', price: '499.00' }];
      addonServiceService.resolveForProduct.mockResolvedValue(addons);

      expect(await publicController.resolveForProduct('p1')).toEqual({ data: addons });
      expect(addonServiceService.resolveForProduct).toHaveBeenCalledWith('p1');
    });

    it('carries no guard — the resolved list is public', () => {
      expect(Reflect.getMetadata('__guards__', AddonServiceController)).toBeUndefined();
    });
  });

  describe('admin', () => {
    it('is gated by PermissionGuard at the controller level (every route)', () => {
      const guards = Reflect.getMetadata('__guards__', AdminAddonServiceController) as unknown[];
      expect(guards).toContain(PermissionGuard);
    });

    it('delegates catalog CRUD and wraps single results in { data }', async () => {
      addonServiceService.create.mockResolvedValue({ id: 'svc-a' });
      addonServiceService.update.mockResolvedValue({ id: 'svc-a' });
      addonServiceService.setActive.mockResolvedValue({ id: 'svc-a', isActive: false });
      addonServiceService.findById.mockResolvedValue({ id: 'svc-a' });

      expect(await adminController.create({ name: 'W', price: 1 })).toEqual({
        data: { id: 'svc-a' },
      });
      expect(await adminController.update('svc-a', { name: 'W2' })).toEqual({
        data: { id: 'svc-a' },
      });
      expect(await adminController.setStatus('svc-a', { isActive: false })).toEqual({
        data: { id: 'svc-a', isActive: false },
      });
      expect(await adminController.findById('svc-a')).toEqual({ data: { id: 'svc-a' } });
      expect(addonServiceService.setActive).toHaveBeenCalledWith('svc-a', false);
    });

    it('passes the paginated admin list envelope straight through', async () => {
      const page = { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
      addonServiceService.findAllAdmin.mockResolvedValue(page);

      expect(await adminController.findAllAdmin({ page: 1, limit: 20 })).toBe(page);
    });

    it('delegates the category-template read/replace routes', async () => {
      addonServiceService.findCategoryTemplate.mockResolvedValue({ addonServiceIds: ['svc-a'] });
      addonServiceService.setCategoryTemplate.mockResolvedValue({ addonServiceIds: [] });
      addonServiceService.resolveTemplateForCategory.mockResolvedValue({ source: 'none' });

      expect(await adminController.getCategoryTemplate('cat-1')).toEqual({
        data: { addonServiceIds: ['svc-a'] },
      });
      expect(await adminController.setCategoryTemplate('cat-1', { addonServiceIds: [] })).toEqual({
        data: { addonServiceIds: [] },
      });
      expect(await adminController.resolveCategoryTemplate('cat-1')).toEqual({
        data: { source: 'none' },
      });
      expect(addonServiceService.setCategoryTemplate).toHaveBeenCalledWith('cat-1', {
        addonServiceIds: [],
      });
    });

    it('delegates the product-delta upsert and clear routes', async () => {
      addonServiceService.setProductDelta.mockResolvedValue({ id: 'd1' });

      expect(
        await adminController.setProductDelta('p1', 'svc-a', {
          type: AddonDeltaType.OVERRIDE,
          price: 1299,
        }),
      ).toEqual({ data: { id: 'd1' } });
      expect(addonServiceService.setProductDelta).toHaveBeenCalledWith('p1', 'svc-a', {
        type: AddonDeltaType.OVERRIDE,
        price: 1299,
      });

      expect(await adminController.clearProductDelta('p1', 'svc-a')).toEqual({ data: null });
      expect(addonServiceService.clearProductDelta).toHaveBeenCalledWith('p1', 'svc-a');
    });
  });
});
