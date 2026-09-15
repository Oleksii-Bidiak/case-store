import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CategoryRepository } from '../category/category.repository';
import { DeviceRepository } from '../device/device.repository';
import { CatalogLandingRepository } from './catalog-landing.repository';
import { CatalogLandingService } from './catalog-landing.service';

/**
 * Unit cover for the compatibility landing pages (TASK-490).
 *
 * The behaviour that needs REAL rows — the visibility scope and the counts — is
 * pinned by `test/compat-landing-pages.int-spec.ts` against Postgres. What is
 * worth asserting with mocks is the part that is pure bookkeeping and would
 * otherwise only be exercised through a database: the ancestor ROLLUP (a pair
 * is emitted once per active ancestor, sums accumulate, an inactive link is
 * skipped without stopping the walk), the ordering the sitemap depends on, and
 * that every way of "no such page" ends in one NotFoundException.
 */
describe('CatalogLandingService', () => {
  let service: CatalogLandingService;

  const landingRepository = {
    countCompatPairs: jest.fn(),
    countPairProducts: jest.fn(),
  };
  const categoryRepository = {
    findAncestorChainsOrdered: jest.fn(),
    findByIds: jest.fn(),
    findBySlug: jest.fn(),
    findSubtreeIds: jest.fn(),
  };
  const deviceRepository = {
    findModelsByIds: jest.fn(),
    findModelBySlug: jest.fn(),
  };

  const category = (id: string, slug: string, isActive = true) => ({
    id,
    slug,
    name: slug,
    isActive,
  });
  const model = (id: string, slug: string, isActive = true) => ({
    id,
    deviceBrandId: 'brand-1',
    name: slug,
    slug,
    series: null,
    releaseYear: null,
    isActive,
    metaTitle: null,
    metaDescription: null,
    description: null,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogLandingService,
        { provide: CatalogLandingRepository, useValue: landingRepository },
        { provide: CategoryRepository, useValue: categoryRepository },
        { provide: DeviceRepository, useValue: deviceRepository },
      ],
    }).compile();
    service = moduleRef.get(CatalogLandingService);
  });

  describe('getCompatPages', () => {
    it('returns nothing, and asks nothing else, when no pair has products', async () => {
      landingRepository.countCompatPairs.mockResolvedValue([]);

      expect(await service.getCompatPages()).toEqual([]);
      // The short-circuit is the point: an empty catalogue must not cost a
      // chain CTE and two more reads on every sitemap request.
      expect(categoryRepository.findAncestorChainsOrdered).not.toHaveBeenCalled();
    });

    it('emits one page per ACTIVE ancestor and sums the counts into it', async () => {
      landingRepository.countCompatPairs.mockResolvedValue([
        { categoryId: 'leaf-a', deviceModelId: 'phone', productCount: 2 },
        { categoryId: 'leaf-b', deviceModelId: 'phone', productCount: 3 },
      ]);
      // Two leaves under one root: leaf-a → root, leaf-b → root.
      categoryRepository.findAncestorChainsOrdered.mockResolvedValue(
        new Map([
          ['leaf-a', ['leaf-a', 'root']],
          ['leaf-b', ['leaf-b', 'root']],
        ]),
      );
      categoryRepository.findByIds.mockResolvedValue([
        category('leaf-a', 'cases-a'),
        category('leaf-b', 'cases-b'),
        category('root', 'accessories'),
      ]);
      deviceRepository.findModelsByIds.mockResolvedValue([model('phone', 'iphone-15-pro')]);

      const pages = await service.getCompatPages();

      expect(pages).toEqual([
        {
          categoryId: 'root',
          categorySlug: 'accessories',
          categoryName: 'accessories',
          deviceModelId: 'phone',
          deviceSlug: 'iphone-15-pro',
          deviceName: 'iphone-15-pro',
          // 2 + 3: the root's own listing rolls BOTH leaves up.
          productCount: 5,
        },
        {
          categoryId: 'leaf-a',
          categorySlug: 'cases-a',
          categoryName: 'cases-a',
          deviceModelId: 'phone',
          deviceSlug: 'iphone-15-pro',
          deviceName: 'iphone-15-pro',
          productCount: 2,
        },
        {
          categoryId: 'leaf-b',
          categorySlug: 'cases-b',
          categoryName: 'cases-b',
          deviceModelId: 'phone',
          deviceSlug: 'iphone-15-pro',
          deviceName: 'iphone-15-pro',
          productCount: 3,
        },
      ]);
    });

    it('skips a deactivated ancestor without stopping the walk above it', async () => {
      landingRepository.countCompatPairs.mockResolvedValue([
        { categoryId: 'leaf', deviceModelId: 'phone', productCount: 1 },
      ]);
      categoryRepository.findAncestorChainsOrdered.mockResolvedValue(
        new Map([['leaf', ['leaf', 'middle', 'root']]]),
      );
      categoryRepository.findByIds.mockResolvedValue([
        category('leaf', 'cases'),
        category('middle', 'withdrawn', false),
        category('root', 'accessories'),
      ]);
      deviceRepository.findModelsByIds.mockResolvedValue([model('phone', 'iphone-15-pro')]);

      const slugs = (await service.getCompatPages()).map((page) => page.categorySlug);

      expect(slugs).toEqual(['accessories', 'cases']);
      expect(slugs).not.toContain('withdrawn');
    });

    it('drops a pair whose device model no longer resolves', async () => {
      landingRepository.countCompatPairs.mockResolvedValue([
        { categoryId: 'leaf', deviceModelId: 'ghost', productCount: 1 },
      ]);
      categoryRepository.findAncestorChainsOrdered.mockResolvedValue(new Map([['leaf', ['leaf']]]));
      categoryRepository.findByIds.mockResolvedValue([category('leaf', 'cases')]);
      deviceRepository.findModelsByIds.mockResolvedValue([]);

      // A page nobody can label is not a page. Emitting it with an empty slug
      // would put `/catalog/cases/` in the sitemap.
      expect(await service.getCompatPages()).toEqual([]);
    });
  });

  describe('getCompatPage', () => {
    const resolvesTo = (cat: unknown, dev: unknown) => {
      categoryRepository.findBySlug.mockResolvedValue(cat);
      deviceRepository.findModelBySlug.mockResolvedValue(dev);
    };

    it('returns the pair with the count the listing will show', async () => {
      resolvesTo(category('leaf', 'cases'), model('phone', 'iphone-15-pro'));
      categoryRepository.findSubtreeIds.mockResolvedValue(['leaf', 'deeper']);
      landingRepository.countPairProducts.mockResolvedValue(7);

      const page = await service.getCompatPage('cases', 'iphone-15-pro');

      expect(page.categorySlug).toBe('cases');
      expect(page.deviceModel.slug).toBe('iphone-15-pro');
      expect(page.productCount).toBe(7);
      // The SUBTREE, not the single id — the page's own listing rolls up, so
      // the existence check has to roll up with it.
      expect(landingRepository.countPairProducts).toHaveBeenCalledWith(['leaf', 'deeper'], 'phone');
    });

    it.each([
      ['an unknown category', null, model('phone', 'iphone-15-pro')],
      ['an unknown device model', category('leaf', 'cases'), null],
      [
        'a deactivated device model',
        category('leaf', 'cases'),
        model('phone', 'iphone-15-pro', false),
      ],
    ])('404s %s', async (_label, cat, dev) => {
      resolvesTo(cat, dev);

      await expect(service.getCompatPage('cases', 'iphone-15-pro')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(landingRepository.countPairProducts).not.toHaveBeenCalled();
    });

    it('404s a real pair with nothing visible in it', async () => {
      resolvesTo(category('leaf', 'cases'), model('phone', 'iphone-15-pro'));
      categoryRepository.findSubtreeIds.mockResolvedValue(['leaf']);
      landingRepository.countPairProducts.mockResolvedValue(0);

      await expect(service.getCompatPage('cases', 'iphone-15-pro')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('asks the category repository for the ACTIVE-only row', async () => {
      resolvesTo(category('leaf', 'cases'), model('phone', 'iphone-15-pro'));
      categoryRepository.findSubtreeIds.mockResolvedValue(['leaf']);
      landingRepository.countPairProducts.mockResolvedValue(1);

      await service.getCompatPage('cases', 'iphone-15-pro');

      // No second argument — `findBySlug` defaults to activeOnly, which is what
      // makes a withdrawn category 404 here exactly as it does on
      // `/categories/<slug>`. An explicit `{ activeOnly: false }` slipped in
      // later would publish pages for categories that are off sale.
      expect(categoryRepository.findBySlug).toHaveBeenCalledWith('cases');
    });
  });
});
