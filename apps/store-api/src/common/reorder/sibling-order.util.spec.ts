import {
  applySortOrderWrites,
  lockKey,
  resolveSiblingOrderWrites,
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

    // TASK-429 / review finding #3. Every sortable model stamps `updatedAt` via
    // `@updatedAt`, and `Page.updatedAt` is published by the storefront as the document's
    // revision date — so a write to a row that did not move is not a wasted statement, it
    // is a LIE to the customer ("privacy policy updated today"). Skipping it is the fix.
    it('does NOT write a row the snapshot already shows at its target index', async () => {
      await writeSiblingOrder(delegate, ['a', 'c', 'b'], {}, [
        { id: 'a', sortOrder: 0 },
        { id: 'b', sortOrder: 1 },
        { id: 'c', sortOrder: 2 },
      ]);

      expect(delegate.updateMany).toHaveBeenCalledTimes(2);
      expect(delegate.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'c' },
        data: { sortOrder: 1 },
      });
      expect(delegate.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 'b' },
        data: { sortOrder: 2 },
      });
    });
  });

  // ─── resolveSiblingOrderWrites (TASK-429) ───────────────────────────────────

  describe('resolveSiblingOrderWrites', () => {
    it('keeps only the rows whose slot actually changes', () => {
      const writes = resolveSiblingOrderWrites(
        ['a', 'c', 'b'],
        [
          { id: 'a', sortOrder: 0 },
          { id: 'b', sortOrder: 1 },
          { id: 'c', sortOrder: 2 },
        ],
      );

      expect(writes).toEqual([
        { id: 'c', sortOrder: 1 },
        { id: 'b', sortOrder: 2 },
      ]);
    });

    it('writes nothing at all when the payload restates the order the bucket is already in', () => {
      expect(
        resolveSiblingOrderWrites(
          ['a', 'b'],
          [
            { id: 'a', sortOrder: 0 },
            { id: 'b', sortOrder: 1 },
          ],
        ),
      ).toEqual([]);
    });

    /**
     * The pre-TASK-428 state of every list: every row still at the `@default(0)` slot. Only
     * the row that genuinely belongs at 0 may be skipped — the rest must be resequenced or
     * the duplicate `sortOrder` values would survive the reorder and the list would keep
     * falling back to its `createdAt` tiebreaker.
     */
    it('resequences a bucket whose rows all share sortOrder 0, skipping only the first', () => {
      const writes = resolveSiblingOrderWrites(
        ['a', 'b', 'c'],
        [
          { id: 'a', sortOrder: 0 },
          { id: 'b', sortOrder: 0 },
          { id: 'c', sortOrder: 0 },
        ],
      );

      expect(writes).toEqual([
        { id: 'b', sortOrder: 1 },
        { id: 'c', sortOrder: 2 },
      ]);
    });

    // Backward compatibility for the callers whose snapshot still selects `id` alone: an
    // ABSENT `sortOrder` means "unknown", never "slot 0", so the full rewrite is kept.
    it('writes every row when the snapshot carries no sortOrder (or is omitted entirely)', () => {
      expect(resolveSiblingOrderWrites(['a', 'b'], [{ id: 'a' }, { id: 'b' }])).toEqual([
        { id: 'a', sortOrder: 0 },
        { id: 'b', sortOrder: 1 },
      ]);
      expect(resolveSiblingOrderWrites(['a', 'b'])).toEqual([
        { id: 'a', sortOrder: 0 },
        { id: 'b', sortOrder: 1 },
      ]);
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
