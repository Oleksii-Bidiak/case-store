import { Test, TestingModule } from '@nestjs/testing';
import { SlugRedirectEntity } from '@prisma/client';
import { CategoryRepository } from './category.repository';
import { CategoryNotFoundError } from './category.errors';
import { PrismaService } from '../prisma';
import { SlugRedirectRepository } from '../slug-redirect';

/**
 * Unit tests for the recursive traversal helpers added in TASK-236
 * (`findSubtreeIds` / `findAncestorIds`). Prisma's `$queryRaw` is mocked, so
 * these cover the JS wrapper contract — self-id inclusion, de-duplication, and
 * the graceful non-existent-id fallback. The SQL correctness itself (siblings
 * must not leak, real recursion at depth) is proven end-to-end against a real
 * Postgres tree in `test/category.repository.int-spec.ts`.
 */
const txMock = {
  $executeRaw: jest.fn(),
  category: {
    update: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
};

const slugRedirectRepositoryMock = {
  recordRename: jest.fn(),
};

describe('CategoryRepository — subtree/ancestor traversal (TASK-236)', () => {
  let repo: CategoryRepository;
  const queryRaw = jest.fn();
  const findMany = jest.fn();
  const update = jest.fn();
  const findUnique = jest.fn();
  const findFirst = jest.fn();
  const count = jest.fn();
  const productCount = jest.fn();
  const productGroupBy = jest.fn();
  const $transaction = jest.fn((cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock));

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryRepository,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: queryRaw,
            category: { findMany, update, findUnique, findFirst, count },
            product: { count: productCount, groupBy: productGroupBy },
            $transaction,
          },
        },
        { provide: SlugRedirectRepository, useValue: slugRedirectRepositoryMock },
      ],
    }).compile();
    repo = module.get(CategoryRepository);
  });

  describe('update (slug rename, TASK-285-H)', () => {
    it('never opens a transaction nor records a redirect when slugRename is absent', async () => {
      update.mockResolvedValue({ id: 'cat-1' });

      const result = await repo.update('cat-1', { name: 'Renamed' });

      expect(result.reparented).toBe(false);
      expect(update).toHaveBeenCalledTimes(1);
      expect($transaction).not.toHaveBeenCalled();
      expect(slugRedirectRepositoryMock.recordRename).not.toHaveBeenCalled();
    });

    // Plan 158 §3.10.4: the whole-tree lock is for an ACTUAL parent change. A full-object
    // PUT re-sending the unchanged current parent must stay on the lock-free fast path —
    // and must never write `parentId` back outside the locks.
    it('takes the fast path (no transaction) when parentId is present but unchanged', async () => {
      findUnique.mockResolvedValue({ parentId: 'parent-1' });
      update.mockResolvedValue({ id: 'cat-1', parentId: 'parent-1' });

      const result = await repo.update('cat-1', { name: 'Renamed', parentId: 'parent-1' });

      expect(result.reparented).toBe(false);
      expect($transaction).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data: { name: 'Renamed' }, // parentId dropped — it is not changing
      });
    });

    it('opens the locked transaction when parentId actually differs from the current one', async () => {
      findUnique.mockResolvedValue({ parentId: 'parent-1' });
      txMock.category.findUnique.mockResolvedValue(null); // prepareReparent's in-tx re-read

      await expect(repo.update('cat-1', { parentId: 'parent-2' })).rejects.toBeInstanceOf(
        CategoryNotFoundError,
      );

      // The locked path WAS entered (the tree lock was taken before the in-tx re-read).
      expect($transaction).toHaveBeenCalledTimes(1);
      expect(txMock.$executeRaw).toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('runs the category update + recordRename inside one transaction when slugRename is given', async () => {
      const renamed = { id: 'cat-1', slug: 'new-slug' };
      txMock.category.update.mockResolvedValue(renamed);

      const result = await repo.update(
        'cat-1',
        { slug: 'new-slug' },
        { oldSlug: 'old-slug', newSlug: 'new-slug' },
      );

      expect(result.category).toBe(renamed);
      expect(result.reparented).toBe(false);
      expect($transaction).toHaveBeenCalledTimes(1);
      expect(txMock.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cat-1' },
          data: expect.objectContaining({ slug: 'new-slug' }),
        }),
      );
      expect(slugRedirectRepositoryMock.recordRename).toHaveBeenCalledWith(
        txMock,
        SlugRedirectEntity.CATEGORY,
        'old-slug',
        'new-slug',
      );
      expect(update).not.toHaveBeenCalled();
    });
  });

  // ─── findBySlug: active-only by DEFAULT (TASK-297) ─────────────────────────
  //
  // The public category page reads through this, so the default decides whether a
  // withdrawn category still has a live URL. `findFirst`, not `findUnique` — the
  // `isActive` guard is not part of the unique index.
  describe('findBySlug', () => {
    it('filters to active categories by default (public read → 404 for a withdrawn one)', async () => {
      findFirst.mockResolvedValue(null);

      const result = await repo.findBySlug('phone-cases');

      expect(result).toBeNull();
      expect(findFirst).toHaveBeenCalledWith({
        where: { slug: 'phone-cases', isActive: true },
      });
    });

    it('sees INACTIVE categories when activeOnly is false (slug-uniqueness check)', async () => {
      // A deactivated category still owns its slug. If this guard could not see it,
      // create/update would sail past the ConflictException into a raw DB unique
      // violation (a 500 instead of a 409).
      findFirst.mockResolvedValue({ id: 'cat-off', slug: 'phone-cases', isActive: false });

      const result = await repo.findBySlug('phone-cases', { activeOnly: false });

      expect(result).not.toBeNull();
      expect(findFirst).toHaveBeenCalledWith({ where: { slug: 'phone-cases' } });
    });
  });

  describe('findSubtreeIds', () => {
    it('returns self + all descendant ids for a 3-level tree', async () => {
      // root → child → grandchild (as the recursive CTE would yield)
      queryRaw.mockResolvedValue([{ id: 'root' }, { id: 'child' }, { id: 'grandchild' }]);

      const ids = await repo.findSubtreeIds('root');

      expect(new Set(ids)).toEqual(new Set(['root', 'child', 'grandchild']));
    });

    it('returns [categoryId] for a leaf with no children', async () => {
      queryRaw.mockResolvedValue([{ id: 'leaf' }]);

      expect(await repo.findSubtreeIds('leaf')).toEqual(['leaf']);
    });

    it('returns [categoryId] (no throw) for a non-existent category', async () => {
      // The CTE base row is empty when the id does not exist.
      queryRaw.mockResolvedValue([]);

      expect(await repo.findSubtreeIds('ghost')).toEqual(['ghost']);
    });

    it('de-duplicates and always includes the self id', async () => {
      queryRaw.mockResolvedValue([{ id: 'root' }, { id: 'child' }, { id: 'root' }]);

      const ids = await repo.findSubtreeIds('root');

      expect(ids).toHaveLength(2);
      expect(new Set(ids)).toEqual(new Set(['root', 'child']));
    });
  });

  describe('findAncestorIds', () => {
    it('returns self + all ancestor ids up to the root', async () => {
      queryRaw.mockResolvedValue([{ id: 'grandchild' }, { id: 'child' }, { id: 'root' }]);

      const ids = await repo.findAncestorIds('grandchild');

      expect(new Set(ids)).toEqual(new Set(['grandchild', 'child', 'root']));
    });

    it('returns [categoryId] for a root category (no parent)', async () => {
      queryRaw.mockResolvedValue([{ id: 'root' }]);

      expect(await repo.findAncestorIds('root')).toEqual(['root']);
    });

    it('returns [categoryId] (no throw) for a non-existent category', async () => {
      queryRaw.mockResolvedValue([]);

      expect(await repo.findAncestorIds('ghost')).toEqual(['ghost']);
    });
  });

  // ─── Ordered ancestor chains (TASK-174) ──────────────────────────────────────
  //
  // The add-on applicability resolver needs the chain NEAREST-FIRST to implement
  // "nearest ancestor wins"; `findAncestorIds` deliberately guarantees no order.
  describe('findAncestorChainOrdered', () => {
    it('returns the chain nearest-first: self, parent, grandparent, root', async () => {
      queryRaw.mockResolvedValue([
        { start_id: 'grandchild', id: 'grandchild', depth: 0 },
        { start_id: 'grandchild', id: 'child', depth: 1 },
        { start_id: 'grandchild', id: 'root', depth: 2 },
      ]);

      expect(await repo.findAncestorChainOrdered('grandchild')).toEqual([
        'grandchild',
        'child',
        'root',
      ]);
    });

    it('returns [categoryId] for a root category (no parent)', async () => {
      queryRaw.mockResolvedValue([{ start_id: 'root', id: 'root', depth: 0 }]);

      expect(await repo.findAncestorChainOrdered('root')).toEqual(['root']);
    });

    it('returns [categoryId] (no throw) for a non-existent category', async () => {
      queryRaw.mockResolvedValue([]);

      expect(await repo.findAncestorChainOrdered('ghost')).toEqual(['ghost']);
    });

    it('keeps only the nearest occurrence of an id if the tree somehow cycles', async () => {
      queryRaw.mockResolvedValue([
        { start_id: 'a', id: 'a', depth: 0 },
        { start_id: 'a', id: 'b', depth: 1 },
        { start_id: 'a', id: 'a', depth: 2 },
        { start_id: 'a', id: 'b', depth: 3 },
      ]);

      expect(await repo.findAncestorChainOrdered('a')).toEqual(['a', 'b']);
    });
  });

  describe('findAncestorChainsOrdered (batched, no-N+1)', () => {
    it('resolves many categories in ONE query, partitioned by the starting id', async () => {
      queryRaw.mockResolvedValue([
        { start_id: 'c1', id: 'c1', depth: 0 },
        { start_id: 'c1', id: 'root', depth: 1 },
        { start_id: 'c2', id: 'c2', depth: 0 },
        { start_id: 'c2', id: 'mid', depth: 1 },
        { start_id: 'c2', id: 'root', depth: 2 },
      ]);

      const chains = await repo.findAncestorChainsOrdered(['c1', 'c2']);

      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(chains.get('c1')).toEqual(['c1', 'root']);
      expect(chains.get('c2')).toEqual(['c2', 'mid', 'root']);
    });

    it('collapses duplicate input ids and still maps every requested id', async () => {
      queryRaw.mockResolvedValue([{ start_id: 'c1', id: 'c1', depth: 0 }]);

      const chains = await repo.findAncestorChainsOrdered(['c1', 'c1', 'ghost']);

      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(chains.size).toBe(2);
      expect(chains.get('c1')).toEqual(['c1']);
      expect(chains.get('ghost')).toEqual(['ghost']);
    });

    it('issues no query at all for an empty id list', async () => {
      const chains = await repo.findAncestorChainsOrdered([]);

      expect(queryRaw).not.toHaveBeenCalled();
      expect(chains.size).toBe(0);
    });
  });

  // ─── findCategoryTree — SEO meta pass-through (TASK-247) ─────────────────────
  //
  // The tree read uses Prisma `include` (no narrowing `select`), so every row —
  // root and nested child — already carries the full Category columns, including
  // the `metaTitle`/`metaDescription` admin overrides. These tests pin that
  // contract so a future `select` narrowing that drops the columns is caught.
  describe('findCategoryTree — SEO meta columns', () => {
    it('returns metaTitle/metaDescription at both root and nested-child level', async () => {
      findMany.mockResolvedValue([
        {
          id: 'root',
          name: 'Phone Cases',
          slug: 'phone-cases',
          description: null,
          image: null,
          parentId: null,
          isActive: true,
          sortOrder: 0,
          metaTitle: 'Phone Cases — Premium',
          metaDescription: 'Root override description.',
          children: [
            {
              id: 'child',
              name: 'iPhone Cases',
              slug: 'iphone-cases',
              description: null,
              image: null,
              parentId: 'root',
              isActive: true,
              sortOrder: 0,
              metaTitle: 'iPhone Cases | Store',
              metaDescription: 'Child override description.',
              children: [],
            },
          ],
        },
      ]);

      const tree = await repo.findCategoryTree();

      expect(tree[0].metaTitle).toBe('Phone Cases — Premium');
      expect(tree[0].metaDescription).toBe('Root override description.');
      expect(tree[0].children[0].metaTitle).toBe('iPhone Cases | Store');
      expect(tree[0].children[0].metaDescription).toBe('Child override description.');
    });

    // TASK-277: the sitemap's `lastModified` needs `updatedAt` on every tree
    // node — pinned the same way as the SEO meta columns above so a future
    // `select` narrowing that drops the column is caught.
    it('returns updatedAt at both root and nested-child level', async () => {
      const rootUpdatedAt = new Date('2026-07-01T10:00:00.000Z');
      const childUpdatedAt = new Date('2026-07-02T11:00:00.000Z');
      findMany.mockResolvedValue([
        {
          id: 'root',
          name: 'Phone Cases',
          slug: 'phone-cases',
          description: null,
          image: null,
          parentId: null,
          isActive: true,
          sortOrder: 0,
          metaTitle: null,
          metaDescription: null,
          updatedAt: rootUpdatedAt,
          children: [
            {
              id: 'child',
              name: 'iPhone Cases',
              slug: 'iphone-cases',
              description: null,
              image: null,
              parentId: 'root',
              isActive: true,
              sortOrder: 0,
              metaTitle: null,
              metaDescription: null,
              updatedAt: childUpdatedAt,
              children: [],
            },
          ],
        },
      ]);

      const tree = await repo.findCategoryTree();

      expect(tree[0].updatedAt).toEqual(rootUpdatedAt);
      expect(tree[0].children[0].updatedAt).toEqual(childUpdatedAt);
    });

    it('does not narrow the query with a `select` clause (relies on `include` full rows)', async () => {
      findMany.mockResolvedValue([]);

      await repo.findCategoryTree();

      expect(findMany).toHaveBeenCalledTimes(1);
      const arg = findMany.mock.calls[0][0];
      expect(arg).toHaveProperty('include');
      expect(arg).not.toHaveProperty('select');
    });
  });

  // ─── setActiveMany (bulk status, TASK-293) ─────────────────────────────────

  describe('setActiveMany', () => {
    it('writes exactly the named ids and returns the refreshed tree with the row count', async () => {
      txMock.category.findMany
        .mockResolvedValueOnce([{ id: 'cat-1' }, { id: 'cat-2' }]) // existence check
        .mockResolvedValueOnce([]); // the in-tx admin-tree read
      txMock.category.updateMany.mockResolvedValue({ count: 2 });

      const result = await repo.setActiveMany(['cat-1', 'cat-2'], false);

      expect($transaction).toHaveBeenCalledTimes(1);
      expect(txMock.category.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['cat-1', 'cat-2'] } },
        data: { isActive: false },
      });
      expect(result.updatedCount).toBe(2);
      expect(result.tree).toEqual([]);
    });

    // All-or-nothing: a partially valid selection must not half-apply, or the panel would
    // report more rows changed than exist.
    it('rejects the whole batch when an id is unknown, naming the missing ones', async () => {
      txMock.category.findMany.mockResolvedValueOnce([{ id: 'cat-1' }]);

      await expect(repo.setActiveMany(['cat-1', 'ghost'], true)).rejects.toThrow(
        expect.objectContaining({
          constructor: CategoryNotFoundError,
          message: expect.stringContaining('ghost'),
        }) as Error,
      );

      expect(txMock.category.updateMany).not.toHaveBeenCalled();
    });

    it('never touches parentId or sortOrder (a status change is not a move)', async () => {
      txMock.category.findMany.mockResolvedValueOnce([{ id: 'cat-1' }]).mockResolvedValueOnce([]);
      txMock.category.updateMany.mockResolvedValue({ count: 1 });

      await repo.setActiveMany(['cat-1'], true);

      const data = txMock.category.updateMany.mock.calls[0][0].data;
      expect(data).toEqual({ isActive: true });
      expect(txMock.$executeRaw).not.toHaveBeenCalled(); // no advisory lock needed
    });
  });

  // ─── product-count rollup (TASK-408) ────────────────────────────────────────

  /**
   * The storefront lists a category's WHOLE subtree (TASK-236); the admin counted
   * only what a category filed directly. So the demo stand showed «Товари: 0» on a
   * parent whose page listed 19 products — two numbers about the same category
   * that could never agree. Both are now returned, and these tests pin which is
   * which: `productCount` direct, `subtreeProductCount` self + descendants.
   */
  describe('product counts — direct vs subtree', () => {
    const row = (
      id: string,
      parentId: string | null,
      products: number,
    ): Record<string, unknown> => ({
      id,
      name: id,
      slug: id,
      description: null,
      image: null,
      parentId,
      isActive: true,
      sortOrder: 0,
      metaTitle: null,
      metaDescription: null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      _count: { products },
    });

    describe('findCategoryTreeForAdmin', () => {
      // The headline case from the live run: a parent files nothing of its own.
      it('shows a childless-of-its-own parent the subtree total AND its direct 0', async () => {
        findMany.mockResolvedValue([row('root', null, 0), row('child', 'root', 19)]);

        const [rootNode] = await repo.findCategoryTreeForAdmin();

        expect(rootNode.productCount).toBe(0);
        expect(rootNode.subtreeProductCount).toBe(19);
        expect(rootNode.children[0].productCount).toBe(19);
        expect(rootNode.children[0].subtreeProductCount).toBe(19);
      });

      it('accumulates through every level and across sibling branches', async () => {
        findMany.mockResolvedValue([
          row('root', null, 1),
          row('mid', 'root', 0),
          row('leaf', 'mid', 3),
          row('sibling', 'root', 2),
        ]);

        const [rootNode] = await repo.findCategoryTreeForAdmin();
        const mid = rootNode.children.find((n) => n.id === 'mid')!;

        expect(mid.subtreeProductCount).toBe(3);
        expect(rootNode.subtreeProductCount).toBe(6);
      });

      // Same rule the tree structure already follows: a node unreachable from any
      // root is not in the tree, so it cannot contribute to anyone's total either.
      it('never counts a node that a parent cycle made unreachable', async () => {
        findMany.mockResolvedValue([row('root', null, 1), row('a', 'b', 10), row('b', 'a', 100)]);

        const tree = await repo.findCategoryTreeForAdmin();

        expect(tree.map((n) => n.id)).toEqual(['root']);
        expect(tree[0].subtreeProductCount).toBe(1);
      });
    });

    describe('findAllWithProductCount', () => {
      /**
       * The page read and the rollup read both go through `category.findMany`; the
       * rollup one is the bare `{ select: { id, parentId } }` projection.
       */
      const wireReads = (page: Array<Record<string, unknown>>): void => {
        findMany.mockImplementation((args: { select?: unknown }) =>
          Promise.resolve(
            args?.select
              ? [
                  { id: 'root', parentId: null },
                  { id: 'child', parentId: 'root' },
                ]
              : page,
          ),
        );
      };

      it('carries the subtree total for a parent whose descendants are off-page', async () => {
        // One row on the page — the child that holds the products is NOT on it,
        // which is exactly why the rollup cannot be computed from the page alone.
        wireReads([row('root', null, 0)]);
        count.mockResolvedValue(1);
        productGroupBy.mockResolvedValue([{ categoryId: 'child', _count: { _all: 19 } }]);

        const result = await repo.findAllWithProductCount({ page: 1, limit: 20 });

        expect(result.categories[0].productCount).toBe(0);
        expect(result.categories[0].subtreeProductCount).toBe(19);
      });

      it('leaves a leaf category with the same number in both fields', async () => {
        wireReads([row('child', 'root', 19)]);
        count.mockResolvedValue(1);
        productGroupBy.mockResolvedValue([{ categoryId: 'child', _count: { _all: 19 } }]);

        const result = await repo.findAllWithProductCount({ page: 1, limit: 20 });

        expect(result.categories[0].productCount).toBe(19);
        expect(result.categories[0].subtreeProductCount).toBe(19);
      });
    });

    describe('findWithProductCount', () => {
      it('adds up the whole subtree when the category has descendants', async () => {
        findUnique.mockResolvedValue({ id: 'root', name: 'Root' });
        queryRaw.mockResolvedValue([{ id: 'root' }, { id: 'child' }]);
        productCount.mockResolvedValueOnce(0).mockResolvedValueOnce(19);

        const result = await repo.findWithProductCount('root');

        expect(result!.productCount).toBe(0);
        expect(result!.subtreeProductCount).toBe(19);
      });

      // A leaf's subtree is itself, so the second count would be the first one
      // re-run — skipping it keeps the common read exactly as cheap as it was.
      it('skips the second count for a leaf and reuses the direct one', async () => {
        findUnique.mockResolvedValue({ id: 'leaf', name: 'Leaf' });
        queryRaw.mockResolvedValue([{ id: 'leaf' }]);
        productCount.mockResolvedValue(4);

        const result = await repo.findWithProductCount('leaf');

        expect(result!.productCount).toBe(4);
        expect(result!.subtreeProductCount).toBe(4);
        expect(productCount).toHaveBeenCalledTimes(1);
      });
    });
  });
});
