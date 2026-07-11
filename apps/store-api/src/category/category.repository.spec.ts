import { Test, TestingModule } from '@nestjs/testing';
import { SlugRedirectEntity } from '@prisma/client';
import { CategoryRepository } from './category.repository';
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
  category: {
    update: jest.fn(),
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
  const $transaction = jest.fn((cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock));

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryRepository,
        {
          provide: PrismaService,
          useValue: { $queryRaw: queryRaw, category: { findMany, update }, $transaction },
        },
        { provide: SlugRedirectRepository, useValue: slugRedirectRepositoryMock },
      ],
    }).compile();
    repo = module.get(CategoryRepository);
  });

  describe('update (slug rename, TASK-285-H)', () => {
    it('never opens a transaction nor records a redirect when slugRename is absent', async () => {
      update.mockResolvedValue({ id: 'cat-1' });

      await repo.update('cat-1', { name: 'Renamed' });

      expect(update).toHaveBeenCalledTimes(1);
      expect($transaction).not.toHaveBeenCalled();
      expect(slugRedirectRepositoryMock.recordRename).not.toHaveBeenCalled();
    });

    it('runs the category update + recordRename inside one transaction when slugRename is given', async () => {
      const renamed = { id: 'cat-1', slug: 'new-slug' };
      txMock.category.update.mockResolvedValue(renamed);

      const result = await repo.update(
        'cat-1',
        { slug: 'new-slug' },
        { oldSlug: 'old-slug', newSlug: 'new-slug' },
      );

      expect(result).toBe(renamed);
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
});
