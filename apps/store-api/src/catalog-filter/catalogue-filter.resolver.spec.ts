import { BrandRepository } from '../brand/brand.repository';
import { CategoryRepository } from '../category/category.repository';
import { DeviceRepository } from '../device/device.repository';
import {
  CatalogueFilterResolver,
  UNRESOLVED_FILTER_ID,
  UNRESOLVED_FILTER_KEY,
} from './catalogue-filter.resolver';

describe('CatalogueFilterResolver (TASK-420)', () => {
  let categoryRepo: { findBySlug: jest.Mock; findById: jest.Mock };
  let brandRepo: { findBySlug: jest.Mock; findById: jest.Mock };
  let deviceRepo: { findModelBySlug: jest.Mock; findModelById: jest.Mock };
  let resolver: CatalogueFilterResolver;

  beforeEach(() => {
    categoryRepo = {
      findBySlug: jest.fn().mockResolvedValue({ id: 'cat-1', slug: 'phone-cases' }),
      findById: jest.fn().mockResolvedValue({ id: 'cat-1', slug: 'phone-cases' }),
    };
    brandRepo = {
      findBySlug: jest.fn().mockResolvedValue({ id: 'brand-1', slug: 'apple' }),
      findById: jest.fn().mockResolvedValue({ id: 'brand-1', slug: 'apple' }),
    };
    deviceRepo = {
      findModelBySlug: jest.fn().mockResolvedValue({ id: 'model-1', slug: 'iphone-15' }),
      findModelById: jest.fn().mockResolvedValue({ id: 'model-1', slug: 'iphone-15' }),
    };
    resolver = new CatalogueFilterResolver(
      categoryRepo as unknown as CategoryRepository,
      brandRepo as unknown as BrandRepository,
      deviceRepo as unknown as DeviceRepository,
    );
  });

  it('costs no query when nothing is filtered', async () => {
    const resolved = await resolver.resolve({});

    expect(resolved).toEqual({
      categoryId: undefined,
      brandId: undefined,
      deviceModelId: undefined,
      categoryKey: undefined,
      brandKey: undefined,
      deviceKey: undefined,
    });
    expect(categoryRepo.findBySlug).not.toHaveBeenCalled();
    expect(categoryRepo.findById).not.toHaveBeenCalled();
    expect(brandRepo.findBySlug).not.toHaveBeenCalled();
    expect(deviceRepo.findModelBySlug).not.toHaveBeenCalled();
  });

  it('resolves every axis from its slug', async () => {
    const resolved = await resolver.resolve({
      category: 'phone-cases',
      brand: 'apple',
      device: 'iphone-15',
    });

    expect(resolved).toEqual({
      categoryId: 'cat-1',
      brandId: 'brand-1',
      deviceModelId: 'model-1',
      categoryKey: 'phone-cases',
      brandKey: 'apple',
      deviceKey: 'iphone-15',
    });
  });

  // The admin table addresses everything by id and binds the same DTO, so the
  // legacy spelling has to keep working — this is what makes the migration a
  // storefront-only URL change rather than a breaking API change.
  it('still resolves every axis from its legacy uuid', async () => {
    const resolved = await resolver.resolve({
      categoryId: 'cat-1',
      brandId: 'brand-1',
      deviceModelId: 'model-1',
    });

    expect(resolved.categoryId).toBe('cat-1');
    expect(resolved.brandId).toBe('brand-1');
    expect(resolved.deviceModelId).toBe('model-1');
  });

  // The point of resolving an id at all (it is already the id the repository
  // wants): it yields the slug, which is the ONE form the cache keys on. Both
  // spellings of one filter must therefore produce the same key segment.
  it('gives the two spellings of one filter the same cache-key segment', async () => {
    const bySlug = await resolver.resolve({ brand: 'apple' });
    const byId = await resolver.resolve({ brandId: 'brand-1' });

    expect(bySlug.brandKey).toBe(byId.brandKey);
    expect(bySlug.brandId).toBe(byId.brandId);
  });

  it('prefers the slug when both spellings of one axis are sent', async () => {
    brandRepo.findBySlug.mockResolvedValue({ id: 'from-slug', slug: 'apple' });

    const resolved = await resolver.resolve({ brand: 'apple', brandId: 'from-uuid' });

    expect(resolved.brandId).toBe('from-slug');
    expect(brandRepo.findById).not.toHaveBeenCalled();
  });

  // Degrade, don't refuse: a dead link is not a client error. But it is also not
  // permission to show the whole catalogue — the filter stays applied and
  // matches nothing, exactly as an unknown-but-well-formed uuid always did.
  it('turns an unknown slug into a filter that matches nothing', async () => {
    categoryRepo.findBySlug.mockResolvedValue(null);
    brandRepo.findBySlug.mockResolvedValue(null);
    deviceRepo.findModelBySlug.mockResolvedValue(null);

    const resolved = await resolver.resolve({
      category: 'nope',
      brand: 'nope',
      device: 'nope',
    });

    expect(resolved.categoryId).toBe(UNRESOLVED_FILTER_ID);
    expect(resolved.brandId).toBe(UNRESOLVED_FILTER_ID);
    expect(resolved.deviceModelId).toBe(UNRESOLVED_FILTER_ID);
    expect(resolved.categoryKey).toBe(UNRESOLVED_FILTER_KEY);
    expect(resolved.brandKey).toBe(UNRESOLVED_FILTER_KEY);
    expect(resolved.deviceKey).toBe(UNRESOLVED_FILTER_KEY);
  });

  it('uses the same sentinel for an unknown legacy uuid', async () => {
    brandRepo.findById.mockResolvedValue(null);

    const resolved = await resolver.resolve({ brandId: 'ffffffff-0000-4000-8000-000000000000' });

    expect(resolved.brandId).toBe(UNRESOLVED_FILTER_ID);
    expect(resolved.brandKey).toBe(UNRESOLVED_FILTER_KEY);
  });

  // The sentinel id reaches `CategoryRepository.findSubtreeIds`, whose raw CTE
  // compares it against a `uuid` column — a non-uuid sentinel would be a
  // Postgres error rather than a miss.
  it('uses a syntactically valid UUID as the "matches nothing" id', () => {
    expect(UNRESOLVED_FILTER_ID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  // `!` is not in the slug alphabet (`generateSlug` keeps only `[a-z0-9-]`), so
  // a real slug can never be mistaken for the sentinel key.
  it('uses a cache-key sentinel no generated slug can spell', () => {
    expect(UNRESOLVED_FILTER_KEY).not.toMatch(/^[a-z0-9-]+$/);
  });

  // A deactivated category must stay filterable: the admin listing is exactly
  // the place an operator goes to re-file the products it stranded. Public
  // visibility is enforced downstream by `categoryActiveOnly` (TASK-297).
  it('resolves a category regardless of its active flag', async () => {
    await resolver.resolve({ category: 'phone-cases' });

    expect(categoryRepo.findBySlug).toHaveBeenCalledWith('phone-cases', { activeOnly: false });
  });
});
