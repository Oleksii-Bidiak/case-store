import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { CatalogImportRepository } from '../src/catalog-import/catalog-import.repository';
import { CatalogLandingRepository } from '../src/catalog-landing/catalog-landing.repository';
import { CatalogLandingService } from '../src/catalog-landing/catalog-landing.service';
import { CategoryRepository } from '../src/category/category.repository';
import {
  CategoryMoveTargetHiddenError,
  CategoryMoveTargetInSubtreeError,
  CategoryMoveTargetNotFoundError,
  CategoryMoveTargetRequiredError,
  CategoryNotFoundError,
  CategorySlugConflictError,
} from '../src/category/category.errors';
import { CATEGORY_TREE_LOCK_KEY } from '../src/category/category-locks';
import { acquireAdvisoryLocks } from '../src/common/reorder';
import { DeviceRepository } from '../src/device/device.repository';
import { PrismaService } from '../src/prisma';
import { buildProductListWhere } from '../src/product/product-list-where';
import { PUBLIC_PRODUCT_WHERE } from '../src/product/product-visibility';
import { ProductRestoreCategoryGoneError } from '../src/product/product.errors';
import { ProductRepository } from '../src/product/product.repository';
import { SlugRedirectRepository } from '../src/slug-redirect';

/**
 * Category deletion against a REAL Postgres — the session gate of TASK-652/653
 * (plan 185 part A, decision B-2 of plan 178).
 *
 * Deletion tombstones a whole subtree and, in the SAME transaction, moves every
 * product and carousel out of it. TASK-653 then filters `deletedAt` out of every
 * category read. Mocks cannot prove either half: the advisory locks, the recursive
 * CTEs, the transaction boundary and the `deleted_at` columns in raw SQL only exist
 * on a real database. So this file deletes a real branch and then walks every read
 * path the storefront and the admin use.
 *
 * Fixture (all slugs suffixed with a per-run id, so a shared test DB is safe):
 *
 *   anchor                          (root, live)
 *    ├── branch          ← DELETED  products: pA (active)                compat → model
 *    │    └── middle                 products: pB (active), pBoff (INACTIVE)
 *    │         └── leaf              products: pC (active), pCdel (SOFT-DELETED)
 *    ├── sibling
 *    └── target          ← the move target; already holds pT (active)
 *
 *   carousel → middle
 *
 * Requires an isolated `*_test` database; DATABASE_URL is forced to it by
 * setup-int.ts. Run with `npm run test:int -w apps/store-api`.
 */
describe('Category deletion (integration, TASK-652/653)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let categories: CategoryRepository;
  let products: ProductRepository;
  let landing: CatalogLandingService;
  let catalogImport: CatalogImportRepository;

  const s = randomUUID().slice(0, 8);
  const slug = (name: string): string => `del-${name}-${s}`;

  /** Every category this file creates, in creation order (parents first). */
  const createdCategoryIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdCarouselIds: string[] = [];
  let deviceBrandId: string;
  let modelId: string;

  let anchor: string;
  let branch: string;
  let middle: string;
  let leaf: string;
  let sibling: string;
  let target: string;
  let carouselId: string;
  const productIds: Record<string, string> = {};

  const makeCategory = async (
    name: string,
    parentId: string | null,
    sortOrder = 0,
  ): Promise<string> => {
    const row = await prisma.category.create({
      data: { name: `del ${name}`, slug: slug(name), parentId, sortOrder },
    });
    createdCategoryIds.push(row.id);
    return row.id;
  };

  const makeProduct = async (
    name: string,
    categoryId: string,
    extra: { isActive?: boolean; deletedAt?: Date; compat?: string[] } = {},
  ): Promise<string> => {
    const row = await prisma.product.create({
      data: {
        name: `del ${name}`,
        slug: slug(name),
        price: '19.99',
        stock: 5,
        categoryId,
        isActive: extra.isActive ?? true,
        deletedAt: extra.deletedAt ?? null,
        deviceCompat: { create: (extra.compat ?? []).map((deviceModelId) => ({ deviceModelId })) },
      },
    });
    createdProductIds.push(row.id);
    return row.id;
  };

  /** Every id anywhere in a nested (public) tree. */
  const treeIds = (nodes: Array<{ id: string; children?: unknown[] }>): string[] =>
    nodes.flatMap((node) => [
      node.id,
      ...treeIds((node.children ?? []) as Array<{ id: string; children?: unknown[] }>),
    ]);

  const productState = async (ids: string[]) =>
    prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, categoryId: true, isActive: true, deletedAt: true },
      orderBy: { id: 'asc' },
    });

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        PrismaService,
        SlugRedirectRepository,
        CategoryRepository,
        ProductRepository,
        DeviceRepository,
        CatalogLandingRepository,
        CatalogLandingService,
        CatalogImportRepository,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    categories = moduleRef.get(CategoryRepository);
    products = moduleRef.get(ProductRepository);
    landing = moduleRef.get(CatalogLandingService);
    catalogImport = moduleRef.get(CatalogImportRepository);

    anchor = await makeCategory('anchor', null);
    branch = await makeCategory('branch', anchor, 0);
    sibling = await makeCategory('sibling', anchor, 1);
    target = await makeCategory('target', anchor, 2);
    middle = await makeCategory('middle', branch);
    leaf = await makeCategory('leaf', middle);

    const brand = await prisma.deviceBrand.create({
      data: { name: 'del brand', slug: slug('brand') },
    });
    deviceBrandId = brand.id;
    modelId = (
      await prisma.deviceModel.create({
        data: { deviceBrandId, name: 'del phone', slug: slug('phone') },
      })
    ).id;

    productIds.pA = await makeProduct('pA', branch, { compat: [modelId] });
    productIds.pB = await makeProduct('pB', middle);
    productIds.pBoff = await makeProduct('pBoff', middle, { isActive: false });
    productIds.pC = await makeProduct('pC', leaf);
    productIds.pCdel = await makeProduct('pCdel', leaf, { deletedAt: new Date('2026-01-01') });
    productIds.pT = await makeProduct('pT', target);

    const carousel = await prisma.carousel.create({
      data: { title: 'del carousel', source: 'CATEGORY', categoryId: middle },
    });
    carouselId = carousel.id;
    createdCarouselIds.push(carousel.id);
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await prisma.carousel.deleteMany({ where: { id: { in: createdCarouselIds } } });
    await prisma.productDeviceCompat.deleteMany({
      where: { productId: { in: createdProductIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    if (modelId) await prisma.deviceModel.deleteMany({ where: { id: modelId } });
    if (deviceBrandId) await prisma.deviceBrand.deleteMany({ where: { id: deviceBrandId } });
    // Children before parents — `Category.parent` is a plain FK, not a cascade.
    for (const id of [...createdCategoryIds].reverse()) {
      await prisma.category.deleteMany({ where: { id } });
    }
    await app.close();
  });

  // ─── The main scenario: delete `branch`, move everything into `target` ─────────

  describe('deleting a three-level branch into an existing target', () => {
    let before: Awaited<ReturnType<typeof productState>>;
    let oldSlugs: Record<string, string>;
    let result: Awaited<ReturnType<CategoryRepository['deleteSubtreeWithMove']>>;

    beforeAll(async () => {
      before = await productState(Object.values(productIds));
      oldSlugs = { branch: slug('branch'), middle: slug('middle'), leaf: slug('leaf') };

      // Sanity: the compat page of `branch` exists BEFORE the delete, so its absence
      // afterwards means something.
      const pagesBefore = await landing.getCompatPages();
      expect(pagesBefore.map((page) => page.categorySlug)).toContain(oldSlugs.branch);

      result = await categories.deleteSubtreeWithMove(branch, { kind: 'existing', id: target });
    });

    it('reports what it did', () => {
      expect(result.targetId).toBe(target);
      expect(result.targetCreated).toBe(false);
      expect(new Set(result.subtreeIds)).toEqual(new Set([branch, middle, leaf]));
      // Every product of the subtree — the inactive and the soft-deleted one too.
      expect(result.movedProducts).toBe(5);
      expect(result.switchedCarousels).toBe(1);
    });

    it('tombstones every subtree row: deletedAt, isActive=false, mangled slug', async () => {
      const rows = await prisma.category.findMany({
        where: { id: { in: [branch, middle, leaf] } },
      });
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row.deletedAt).toBeInstanceOf(Date);
        expect(row.isActive).toBe(false);
        expect(row.slug).toMatch(new RegExp(`^deleted:${row.id}:del-`));
      }
    });

    // ─── Products: the hardest condition of B-2 ────────────────────────────────

    it('keeps EVERY product: same rows, same isActive/deletedAt, all filed in the target', async () => {
      const after = await productState(Object.values(productIds));

      expect(after).toHaveLength(before.length);
      for (const row of after) {
        const was = before.find((b) => b.id === row.id)!;
        expect(row.isActive).toBe(was.isActive);
        expect(row.deletedAt?.getTime() ?? null).toBe(was.deletedAt?.getTime() ?? null);
        expect(row.categoryId).toBe(target);
      }
    });

    it('opens a live moved product through the PDP read, with the target as its category', async () => {
      const pdp = await products.findBySlugWithRelations(slug('pC'));
      expect(pdp).not.toBeNull();
      expect(pdp!.category.id).toBe(target);
      expect(pdp!.category.slug).toBe(slug('target'));
    });

    it('counts the moved products in the target listing (public scope)', async () => {
      const subtree = await categories.findSubtreeIds(target);
      const listed = await products.findAll({
        page: 1,
        limit: 50,
        categoryIds: subtree,
        isActive: true,
        categoryActiveOnly: true,
      });
      // pT + pA + pB + pC; pBoff is inactive and pCdel soft-deleted — hidden, but moved.
      expect(listed.total).toBe(4);

      const counted = await prisma.product.count({
        where: buildProductListWhere({
          categoryIds: subtree,
          isActive: true,
          categoryActiveOnly: true,
        }),
      });
      expect(counted).toBe(4);

      const withCount = await categories.findWithProductCount(target);
      expect(withCount!.subtreeProductCount).toBe(4);
    });

    it('switches the carousel to the target', async () => {
      const carousel = await prisma.carousel.findUnique({ where: { id: carouselId } });
      expect(carousel!.categoryId).toBe(target);
    });

    // ─── Every category read hides the tombstones ────────────────────────────

    it('is gone from the public tree and the admin tree', async () => {
      const publicIds = treeIds(await categories.findCategoryTree());
      expect(publicIds).toContain(target);
      for (const id of [branch, middle, leaf]) expect(publicIds).not.toContain(id);

      const adminIds = treeIds(await categories.findCategoryTreeForAdmin());
      expect(adminIds).toContain(target);
      for (const id of [branch, middle, leaf]) expect(adminIds).not.toContain(id);
    });

    it('is gone from findById, findByIds, findChildren and findWithProductCount', async () => {
      expect(await categories.findById(branch)).toBeNull();
      expect(await categories.findByIds([branch, middle, leaf, target])).toEqual([
        expect.objectContaining({ id: target }),
      ]);
      const children = (await categories.findChildren(anchor)).map((row) => row.id);
      expect(new Set(children)).toEqual(new Set([sibling, target]));
      expect(await categories.findChildren(branch)).toEqual([]);
      expect(await categories.findWithProductCount(branch)).toBeNull();
    });

    it('is gone from the subtree / descendant CTEs of its former parent', async () => {
      const subtree = await categories.findSubtreeIds(anchor);
      const descendants = await categories.findDescendantIds(anchor);
      for (const id of [branch, middle, leaf]) {
        expect(subtree).not.toContain(id);
        expect(descendants).not.toContain(id);
      }
      expect(new Set(descendants)).toEqual(new Set([sibling, target]));
    });

    it('is gone from findAllWithProductCount (the admin list) and its total', async () => {
      const listed = await categories.findAllWithProductCount({
        page: 1,
        limit: 100,
        parentId: anchor,
      });
      expect(new Set(listed.categories.map((row) => row.category.id))).toEqual(
        new Set([sibling, target]),
      );
      expect(listed.total).toBe(2);
    });

    it('frees the old slugs: findBySlug is null either way, and create reuses one at once', async () => {
      for (const old of Object.values(oldSlugs)) {
        expect(await categories.findBySlug(old)).toBeNull();
        expect(await categories.findBySlug(old, { activeOnly: false })).toBeNull();
      }

      const reborn = await categories.create({
        name: 'del reborn middle',
        slug: oldSlugs.middle,
        parentId: sibling,
      });
      createdCategoryIds.push(reborn.id);
      expect(reborn.id).not.toBe(middle);
      expect((await categories.findBySlug(oldSlugs.middle))?.id).toBe(reborn.id);
    });

    it('lets the catalogue import re-create a category under an old slug', async () => {
      const byName = await catalogImport.ensureCategories([
        { name: 'del reborn leaf', slug: oldSlugs.leaf },
      ]);
      const id = byName.get('del reborn leaf')!;
      createdCategoryIds.push(id);

      expect(id).not.toBe(leaf);
      const row = await prisma.category.findUnique({ where: { id } });
      expect(row).toEqual(
        expect.objectContaining({ slug: oldSlugs.leaf, isActive: true, deletedAt: null }),
      );
    });

    it('is gone from the compatibility landing pages (the sitemap source)', async () => {
      const pages = (await landing.getCompatPages()).filter((page) => page.deviceSlug.endsWith(s));
      const pageSlugs = pages.map((page) => page.categorySlug);
      expect(pageSlugs).not.toContain(oldSlugs.branch);
      expect(pageSlugs.some((value) => value.startsWith('deleted:'))).toBe(false);
      // The moved product now makes the TARGET a page (and still its ancestor).
      expect(pages).toContainEqual(
        expect.objectContaining({ categorySlug: slug('target'), productCount: 1 }),
      );
      expect(pages).toContainEqual(
        expect.objectContaining({ categorySlug: slug('anchor'), productCount: 1 }),
      );
    });

    // ─── Tree writes keep working around the tombstones ──────────────────────

    it('reorders the former parent bucket without TREE_STALE', async () => {
      const live = await prisma.category.findMany({
        where: { parentId: anchor, deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });
      const reversed = live.map((row) => row.id).reverse();

      await expect(
        categories.applyTreeMoves([{ parentId: anchor, orderedIds: reversed }]),
      ).resolves.toEqual(expect.objectContaining({ movedIds: [] }));

      const after = await prisma.category.findMany({
        where: { id: { in: reversed } },
        select: { id: true, sortOrder: true },
      });
      for (const row of after) expect(row.sortOrder).toBe(reversed.indexOf(row.id));
    });

    it('refuses to reorder, move or create anything under a tombstone', async () => {
      // A tombstone is unknown to the snapshot — it cannot be dragged back in.
      await expect(
        categories.applyTreeMoves([{ parentId: anchor, orderedIds: [target, sibling, branch] }]),
      ).rejects.toBeInstanceOf(CategoryNotFoundError);
      // …nor become anyone's parent…
      await expect(categories.update(sibling, { parentId: branch })).rejects.toBeInstanceOf(
        CategoryNotFoundError,
      );
      // …nor receive a new child (the create re-checks the parent under its lock).
      await expect(
        categories.create({ name: 'del orphan', slug: slug('orphan'), parentId: middle }),
      ).rejects.toBeInstanceOf(CategoryNotFoundError);
      // …nor be switched back on.
      await expect(categories.setActiveMany([branch], true)).rejects.toBeInstanceOf(
        CategoryNotFoundError,
      );
      expect((await prisma.category.findUnique({ where: { id: branch } }))!.isActive).toBe(false);
    });

    it('refuses to delete a tombstone again', async () => {
      await expect(
        categories.deleteSubtreeWithMove(branch, { kind: 'existing', id: target }),
      ).rejects.toBeInstanceOf(CategoryNotFoundError);
    });

    it('refuses a tombstone as a move target', async () => {
      const lone = await makeCategory('lone', null);
      await expect(
        categories.deleteSubtreeWithMove(lone, { kind: 'existing', id: middle }),
      ).rejects.toBeInstanceOf(CategoryMoveTargetNotFoundError);
      expect((await prisma.category.findUnique({ where: { id: lone } }))!.deletedAt).toBeNull();
    });
  });

  // ─── moveToNew ───────────────────────────────────────────────────────────────

  describe('deleting a root branch into a NEW target', () => {
    let root: string;
    let rootChild: string;
    let pRoot: string;
    let pChild: string;

    beforeAll(async () => {
      root = await makeCategory('newroot', null);
      rootChild = await makeCategory('newroot-child', root);
      pRoot = await makeProduct('p-newroot', root);
      pChild = await makeProduct('p-newroot-child', rootChild, { isActive: false });
    });

    it('creates the target at the end of its live bucket and moves everything into it', async () => {
      const liveMax = await prisma.category.aggregate({
        where: { parentId: anchor, deletedAt: null },
        _max: { sortOrder: true },
      });

      const result = await categories.deleteSubtreeWithMove(root, {
        kind: 'new',
        name: 'del fresh target',
        slug: slug('fresh-target'),
        parentId: anchor,
      });
      // A `new` target always yields an id; `null` is only for a target-less delete.
      const createdId = result.targetId!;
      createdCategoryIds.push(createdId);

      expect(result.targetCreated).toBe(true);
      expect(result.movedProducts).toBe(2);
      const created = await prisma.category.findUnique({ where: { id: createdId } });
      expect(created).toEqual(
        expect.objectContaining({
          name: 'del fresh target',
          slug: slug('fresh-target'),
          parentId: anchor,
          isActive: true,
          deletedAt: null,
          sortOrder: (liveMax._max.sortOrder ?? -1) + 1,
        }),
      );
      const moved = await productState([pRoot, pChild]);
      expect(moved.map((row) => row.categoryId)).toEqual([createdId, createdId]);
      expect(moved.find((row) => row.id === pChild)!.isActive).toBe(false);
    });

    it('is gone from the root listing', async () => {
      const roots = await categories.findRootCategories({ page: 1, limit: 1000 });
      const ids = roots.categories.map((row) => row.id);
      expect(ids).not.toContain(root);
      expect(ids).toContain(anchor);
      const tombstonedRoots = await prisma.category.count({
        where: { parentId: null, deletedAt: { not: null } },
      });
      expect(roots.total).toBe(
        (await prisma.category.count({ where: { parentId: null } })) - tombstonedRoots,
      );
    });
  });

  // ─── No target (TASK-655, ДН-2.9) ──────────────────────────────────────────────

  describe('deleting a truly empty leaf WITHOUT a target (TASK-655)', () => {
    /** A live category's row exactly as the refusal must leave it. */
    const expectLive = async (id: string, ownSlug: string) => {
      const row = await prisma.category.findUnique({ where: { id } });
      expect(row).toEqual(
        expect.objectContaining({ deletedAt: null, isActive: true, slug: ownSlug }),
      );
    };

    it('tombstones an empty leaf, moves nothing and frees its slug', async () => {
      const empty = await makeCategory('empty-leaf', anchor, 80);
      await expect(categories.countDeletionImpact(empty)).resolves.toEqual({
        subcategoryCount: 0,
        productCount: 0,
        carouselCount: 0,
        deletedProductCount: 0,
      });

      const result = await categories.deleteSubtreeWithMove(empty, { kind: 'none' });

      expect(result).toEqual({
        targetId: null,
        targetCreated: false,
        subtreeIds: [empty],
        movedProducts: 0,
        switchedCarousels: 0,
      });
      const row = await prisma.category.findUnique({ where: { id: empty } });
      expect(row!.deletedAt).not.toBeNull();
      expect(row!.isActive).toBe(false);
      expect(row!.slug).toBe(`deleted:${empty}:${slug('empty-leaf')}`);
      expect(await categories.findById(empty)).toBeNull();
      expect(await categories.findBySlug(slug('empty-leaf'), { activeOnly: false })).toBeNull();
    });

    // Invariant I1: a soft-deleted product must not end up on a tombstone — TASK-656
    // would restore it into a category that no longer exists.
    it('refuses a leaf holding only a soft-deleted product — nothing written', async () => {
      const ghost = await makeCategory('ghost-leaf', anchor, 81);
      const pGhost = await makeProduct('p-ghost', ghost, { deletedAt: new Date('2026-01-01') });
      await expect(categories.countDeletionImpact(ghost)).resolves.toEqual({
        subcategoryCount: 0,
        productCount: 0,
        carouselCount: 0,
        deletedProductCount: 1,
      });

      await expect(
        categories.deleteSubtreeWithMove(ghost, { kind: 'none' }),
      ).rejects.toBeInstanceOf(CategoryMoveTargetRequiredError);

      await expectLive(ghost, slug('ghost-leaf'));
      const [state] = await productState([pGhost]);
      expect(state.categoryId).toBe(ghost);
      expect(state.deletedAt).not.toBeNull();
    });

    it('refuses a leaf a carousel points at — nothing written', async () => {
      const shown = await makeCategory('carousel-leaf', anchor, 82);
      const carousel = await prisma.carousel.create({
        data: { title: 'del shown', source: 'CATEGORY', categoryId: shown },
      });
      createdCarouselIds.push(carousel.id);

      await expect(
        categories.deleteSubtreeWithMove(shown, { kind: 'none' }),
      ).rejects.toBeInstanceOf(CategoryMoveTargetRequiredError);

      await expectLive(shown, slug('carousel-leaf'));
      expect((await prisma.carousel.findUnique({ where: { id: carousel.id } }))!.categoryId).toBe(
        shown,
      );
    });

    it('refuses a category with a (product-less) child — nothing written', async () => {
      const parent = await makeCategory('empty-parent', anchor, 83);
      const child = await makeCategory('empty-child', parent);

      await expect(
        categories.deleteSubtreeWithMove(parent, { kind: 'none' }),
      ).rejects.toBeInstanceOf(CategoryMoveTargetRequiredError);

      await expectLive(parent, slug('empty-parent'));
      await expectLive(child, slug('empty-child'));
    });
  });

  // ─── Hidden move target (TASK-1837) ─────────────────────────────────────────────
  // A product is public only while its OWN category is active, so moving into a hidden
  // target takes it off the storefront. That needs the operator's explicit consent,
  // checked under the lock against the target's state at that moment.

  describe('moving into a HIDDEN target (TASK-1837)', () => {
    const publicCount = (ids: string[]) =>
      prisma.product.count({ where: { id: { in: ids }, ...PUBLIC_PRODUCT_WHERE } });

    it('refuses without consent — nothing moved, nothing tombstoned', async () => {
      const doomed = await makeCategory('hidden-refused', anchor, 70);
      const hidden = await makeCategory('hidden-target-1', anchor, 71);
      await prisma.category.update({ where: { id: hidden }, data: { isActive: false } });
      const pDoomed = await makeProduct('p-hidden-refused', doomed);

      await expect(
        categories.deleteSubtreeWithMove(doomed, { kind: 'existing', id: hidden }),
      ).rejects.toBeInstanceOf(CategoryMoveTargetHiddenError);
      await expect(
        categories.deleteSubtreeWithMove(doomed, {
          kind: 'existing',
          id: hidden,
          allowHidden: false,
        }),
      ).rejects.toBeInstanceOf(CategoryMoveTargetHiddenError);

      const row = await prisma.category.findUnique({ where: { id: doomed } });
      expect(row).toEqual(
        expect.objectContaining({ deletedAt: null, isActive: true, slug: slug('hidden-refused') }),
      );
      const [state] = await productState([pDoomed]);
      expect(state.categoryId).toBe(doomed);
      expect(await publicCount([pDoomed])).toBe(1);
    });

    it('moves with consent — the products keep their own flags but leave the storefront', async () => {
      const doomed = await makeCategory('hidden-allowed', anchor, 72);
      const hidden = await makeCategory('hidden-target-2', anchor, 73);
      await prisma.category.update({ where: { id: hidden }, data: { isActive: false } });
      const pOne = await makeProduct('p-hidden-allowed-1', doomed);
      const pTwo = await makeProduct('p-hidden-allowed-2', doomed);
      expect(await publicCount([pOne, pTwo])).toBe(2);

      const result = await categories.deleteSubtreeWithMove(doomed, {
        kind: 'existing',
        id: hidden,
        allowHidden: true,
      });

      expect(result.targetId).toBe(hidden);
      expect(result.movedProducts).toBe(2);
      const state = await productState([pOne, pTwo]);
      for (const row of state) {
        expect(row.categoryId).toBe(hidden);
        expect(row.isActive).toBe(true);
        expect(row.deletedAt).toBeNull();
      }
      // Exactly what the dialog warns about: on the site again only once `hidden` is shown.
      expect(await publicCount([pOne, pTwo])).toBe(0);
      await prisma.category.update({ where: { id: hidden }, data: { isActive: true } });
      expect(await publicCount([pOne, pTwo])).toBe(2);
    });

    // A new target is created active: its products stay public even under a hidden
    // parent — only the category is unreachable from the storefront menu.
    it('needs no consent for a NEW target under a hidden parent', async () => {
      const doomed = await makeCategory('hidden-parent-doomed', anchor, 74);
      const hiddenParent = await makeCategory('hidden-parent', anchor, 75);
      await prisma.category.update({ where: { id: hiddenParent }, data: { isActive: false } });
      const pMoved = await makeProduct('p-hidden-parent', doomed);

      const result = await categories.deleteSubtreeWithMove(doomed, {
        kind: 'new',
        name: 'del under hidden',
        slug: slug('under-hidden'),
        parentId: hiddenParent,
      });
      createdCategoryIds.push(result.targetId!);

      const created = await prisma.category.findUnique({ where: { id: result.targetId! } });
      expect(created).toEqual(expect.objectContaining({ parentId: hiddenParent, isActive: true }));
      expect(await publicCount([pMoved])).toBe(1);
    });
  });

  // ─── Atomicity ───────────────────────────────────────────────────────────────

  describe('atomicity — a failure leaves nothing behind', () => {
    /** A fresh `top → bottom` branch with one product at each level. */
    const freshBranch = async (tag: string) => {
      const top = await makeCategory(`${tag}-top`, anchor, 90);
      const bottom = await makeCategory(`${tag}-bottom`, top);
      const pTop = await makeProduct(`${tag}-p-top`, top);
      const pBottom = await makeProduct(`${tag}-p-bottom`, bottom);
      const carousel = await prisma.carousel.create({
        data: { title: `del ${tag}`, source: 'CATEGORY', categoryId: bottom },
      });
      createdCarouselIds.push(carousel.id);
      return { top, bottom, pTop, pBottom, carousel: carousel.id };
    };

    const expectUntouched = async (fixture: Awaited<ReturnType<typeof freshBranch>>) => {
      const rows = await prisma.category.findMany({
        where: { id: { in: [fixture.top, fixture.bottom] } },
      });
      for (const row of rows) {
        expect(row.deletedAt).toBeNull();
        expect(row.isActive).toBe(true);
        expect(row.slug.startsWith('deleted:')).toBe(false);
      }
      const state = await productState([fixture.pTop, fixture.pBottom]);
      expect(state.find((row) => row.id === fixture.pTop)!.categoryId).toBe(fixture.top);
      expect(state.find((row) => row.id === fixture.pBottom)!.categoryId).toBe(fixture.bottom);
      const carousel = await prisma.carousel.findUnique({ where: { id: fixture.carousel } });
      expect(carousel!.categoryId).toBe(fixture.bottom);
    };

    it('target inside the subtree (decided under the lock) → nothing written', async () => {
      const fixture = await freshBranch('in-subtree');

      await expect(
        categories.deleteSubtreeWithMove(fixture.top, { kind: 'existing', id: fixture.bottom }),
      ).rejects.toBeInstanceOf(CategoryMoveTargetInSubtreeError);

      await expectUntouched(fixture);
    });

    it('new target parent inside the subtree → nothing created, nothing written', async () => {
      const fixture = await freshBranch('parent-in-subtree');

      await expect(
        categories.deleteSubtreeWithMove(fixture.top, {
          kind: 'new',
          name: 'del never',
          slug: slug('never-1'),
          parentId: fixture.bottom,
        }),
      ).rejects.toBeInstanceOf(CategoryMoveTargetInSubtreeError);

      expect(await prisma.category.count({ where: { slug: slug('never-1') } })).toBe(0);
      await expectUntouched(fixture);
    });

    it('slug collision (P2002) on the new target → nothing created, nothing written', async () => {
      const fixture = await freshBranch('slug-clash');

      await expect(
        categories.deleteSubtreeWithMove(fixture.top, {
          kind: 'new',
          name: 'del clash',
          slug: slug('sibling'), // held by a live category
          parentId: null,
        }),
      ).rejects.toBeInstanceOf(CategorySlugConflictError);

      expect(await prisma.category.count({ where: { name: 'del clash' } })).toBe(0);
      await expectUntouched(fixture);
    });

    // The strongest form: the failure happens AFTER the target was created and the
    // products and the carousel were moved — only a real transaction undoes that.
    it('a failure while tombstoning rolls back the created target and every move', async () => {
      const fixture = await freshBranch('late-failure');
      const bottomSlug = slug('late-failure-bottom');
      // Occupy the exact mangled slug the bottom row would take, so its tombstone
      // update hits the unique index after everything else has been written.
      const blocker = await prisma.category.create({
        data: { name: 'del blocker', slug: `deleted:${fixture.bottom}:${bottomSlug}` },
      });
      createdCategoryIds.push(blocker.id);

      await expect(
        categories.deleteSubtreeWithMove(fixture.top, {
          kind: 'new',
          name: 'del late target',
          slug: slug('late-target'),
          parentId: anchor,
        }),
      ).rejects.toThrow();

      expect(await prisma.category.count({ where: { slug: slug('late-target') } })).toBe(0);
      await expectUntouched(fixture);
    });
  });

  // ─── Restore × delete: one tree lock (TASK-656, invariant I1) ─────────────────
  // The service checks the category before the write, outside any lock. These prove
  // the write itself re-checks under the tree lock the delete holds for its whole run.

  describe('product restore × category delete — one tree lock', () => {
    it('waits for a tree-lock holder, then refuses a category tombstoned under that lock', async () => {
      const doomed = await makeCategory('restore-doomed', anchor, 95);
      const pGone = await makeProduct('p-restore-doomed', doomed, {
        isActive: false,
        deletedAt: new Date('2026-01-01'),
      });

      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let signalLocked!: () => void;
      const lockHeld = new Promise<void>((resolve) => (signalLocked = resolve));
      // Holds the delete's tree key and tombstones `doomed` under it WITHOUT moving the
      // product: exactly the window the service's early, unlocked check cannot see.
      const holder = prisma.$transaction(
        async (tx) => {
          await acquireAdvisoryLocks(tx, [CATEGORY_TREE_LOCK_KEY]);
          signalLocked();
          await gate;
          await tx.category.update({
            where: { id: doomed },
            data: {
              deletedAt: new Date(),
              isActive: false,
              slug: `deleted:${doomed}:${slug('restore-doomed')}`,
            },
          });
        },
        { timeout: 20_000 },
      );
      await lockHeld;

      let settled = false;
      const restore = products.restore(pGone, slug('p-restore-doomed'), null);
      restore.finally(() => (settled = true)).catch(() => undefined);

      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(settled).toBe(false); // blocked on the tree lock

      release();
      await holder;

      await expect(restore).rejects.toBeInstanceOf(ProductRestoreCategoryGoneError);
      const [state] = await productState([pGone]);
      expect(state.deletedAt).not.toBeNull();
      expect(state.categoryId).toBe(doomed);
    });

    it('a restore racing a real delete always ends live, in the live target', async () => {
      const doomed = await makeCategory('race-doomed', anchor, 96);
      const raceTarget = await makeCategory('race-target', anchor, 97);
      const pRace = await makeProduct('p-race', doomed, {
        isActive: false,
        deletedAt: new Date('2026-01-01'),
      });

      const [restored, deleted] = await Promise.allSettled([
        products.restore(pRace, slug('p-race'), null),
        categories.deleteSubtreeWithMove(doomed, { kind: 'existing', id: raceTarget }),
      ]);

      // Whichever commits first, the other sees its result: the delete moves the
      // (live or tombstoned) product, and the restore reads the row's CURRENT category.
      expect(deleted.status).toBe('fulfilled');
      expect(restored.status).toBe('fulfilled');
      const row = await prisma.product.findUnique({
        where: { id: pRace },
        select: { categoryId: true, deletedAt: true, category: { select: { deletedAt: true } } },
      });
      expect(row).toEqual({
        categoryId: raceTarget,
        deletedAt: null,
        category: { deletedAt: null },
      });
    });
  });
});
