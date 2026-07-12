import {
  applySortOrderWrites,
  lockKey,
  treeLockKey,
  writeSiblingOrder,
  type SortableDelegate,
} from './sibling-order.util';

/**
 * Unit spec for the shared reorder primitive (TASK-291-E, plan 158 §4).
 *
 * The advisory-lock helper and the index→`sortOrder` writer are extracted from
 * `CategoryRepository.applyTreeMoves` so the four flat sortable admins
 * (banners / blog-categories / device-brands / product-groups) can reuse them without
 * re-deriving the rules and getting them subtly wrong.
 */
describe('sibling-order.util', () => {
  // ─── lock keys ──────────────────────────────────────────────────────────────

  describe('lockKey', () => {
    it('namespaces the key by resource', () => {
      expect(lockKey('categories', 'cat-1')).toBe('categories:cat-1');
      expect(lockKey('banners', 'cat-1')).toBe('banners:cat-1');
    });

    // Advisory locks are DATABASE-GLOBAL and every resource has a `__root__` bucket —
    // without the prefix a banner reorder would serialise against a root-category one.
    it('maps the root bucket (null parent) to a namespaced sentinel, never a bare one', () => {
      expect(lockKey('categories', null)).toBe('categories:__root__');
      expect(lockKey('banners', null)).toBe('banners:__root__');
      expect(lockKey('categories', null)).not.toBe(lockKey('banners', null));
    });

    it('exposes the tree-scoped key, distinct from every bucket key', () => {
      expect(treeLockKey('categories')).toBe('categories:__tree__');
      expect(treeLockKey('categories')).not.toBe(lockKey('categories', null));
    });
  });

  // ─── writeSiblingOrder ──────────────────────────────────────────────────────

  describe('writeSiblingOrder', () => {
    let delegate: SortableDelegate & { updateMany: jest.Mock };

    beforeEach(() => {
      delegate = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
    });

    it('writes the array index as sortOrder, one updateMany per id, in order', async () => {
      await writeSiblingOrder(delegate, ['b', 'a', 'c']);

      expect(delegate.updateMany).toHaveBeenCalledTimes(3);
      expect(delegate.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'b' },
        data: { sortOrder: 0 },
      });
      expect(delegate.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 'a' },
        data: { sortOrder: 1 },
      });
      expect(delegate.updateMany).toHaveBeenNthCalledWith(3, {
        where: { id: 'c' },
        data: { sortOrder: 2 },
      });
    });

    // `updateMany` (not `update`) + the scope guard: a row that vanished concurrently, or
    // an id forged from another scope, is a silent no-op instead of a P2025 abort.
    it('merges the scope guard into the WHERE clause', async () => {
      await writeSiblingOrder(delegate, ['a'], { productId: 'p-1' });

      expect(delegate.updateMany).toHaveBeenCalledWith({
        where: { id: 'a', productId: 'p-1' },
        data: { sortOrder: 0 },
      });
    });

    it('is a no-op for an empty list (a parent losing its last child is legal)', async () => {
      await writeSiblingOrder(delegate, []);

      expect(delegate.updateMany).not.toHaveBeenCalled();
    });
  });

  // ─── applySortOrderWrites ───────────────────────────────────────────────────

  describe('applySortOrderWrites', () => {
    let delegate: SortableDelegate & { updateMany: jest.Mock };

    beforeEach(() => {
      delegate = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
    });

    it('writes each resolved row exactly once, including a parent change', async () => {
      await applySortOrderWrites(delegate, [
        { id: 'a', parentId: 'p-2', sortOrder: 0 },
        { id: 'b', parentId: null, sortOrder: 1 },
      ]);

      expect(delegate.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'a' },
        data: { sortOrder: 0, parentId: 'p-2' },
      });
      expect(delegate.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 'b' },
        data: { sortOrder: 1, parentId: null },
      });
    });

    it('omits parentId from the data when the row does not carry one (flat resources)', async () => {
      await applySortOrderWrites(delegate, [{ id: 'a', sortOrder: 2 }]);

      expect(delegate.updateMany).toHaveBeenCalledWith({
        where: { id: 'a' },
        data: { sortOrder: 2 },
      });
    });

    it('writes nothing when there are no resolved rows (an idempotent replay)', async () => {
      await applySortOrderWrites(delegate, []);

      expect(delegate.updateMany).not.toHaveBeenCalled();
    });
  });
});
