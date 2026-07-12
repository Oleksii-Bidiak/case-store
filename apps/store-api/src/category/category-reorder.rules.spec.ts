import {
  CategoryCycleError,
  CategoryDuplicateIdError,
  CategoryMaxDepthError,
  CategoryNotFoundError,
  CategorySelfParentError,
  CategoryTreeStaleError,
  CategoryErrorCode,
} from './category.errors';
import {
  MAX_CATEGORY_TREE_LEVELS,
  assertMoveDepth,
  validateAndResolveReorder,
  type CategorySnapshotRow,
  type ReorderGroupInput,
  type ResolvedWrite,
} from './category-reorder.rules';

/**
 * Base fixture (1-based levels, root = level 1):
 *
 *   root1 (L1, so=0)
 *     a    (L2, so=0)
 *       a1  (L3, so=0)
 *         a1x (L4, so=0)
 *     b    (L2, so=1)
 *       b1  (L3, so=0)
 *   root2 (L1, so=1)
 */
const baseSnapshot = (): CategorySnapshotRow[] => [
  { id: 'root1', parentId: null, sortOrder: 0 },
  { id: 'root2', parentId: null, sortOrder: 1 },
  { id: 'a', parentId: 'root1', sortOrder: 0 },
  { id: 'b', parentId: 'root1', sortOrder: 1 },
  { id: 'a1', parentId: 'a', sortOrder: 0 },
  { id: 'a1x', parentId: 'a1', sortOrder: 0 },
  { id: 'b1', parentId: 'b', sortOrder: 0 },
];

const group = (parentId: string | null, orderedIds: string[]): ReorderGroupInput => ({
  parentId,
  orderedIds,
});

const byId = (writes: ResolvedWrite[]): ResolvedWrite[] =>
  [...writes].sort((x, y) => x.id.localeCompare(y.id));

describe('category-reorder.rules', () => {
  describe('MAX_CATEGORY_TREE_LEVELS', () => {
    it('is 4 (root = level 1; the structural cap of both tree reads)', () => {
      expect(MAX_CATEGORY_TREE_LEVELS).toBe(4);
    });
  });

  describe('validateAndResolveReorder — duplicate ids', () => {
    it('rejects the same id twice within one group', () => {
      expect(() =>
        validateAndResolveReorder(baseSnapshot(), [group('root1', ['a', 'b', 'a'])]),
      ).toThrow(CategoryDuplicateIdError);
    });

    it('rejects the same id appearing in two different groups', () => {
      expect(() =>
        validateAndResolveReorder(baseSnapshot(), [
          group('root1', ['a', 'b']),
          group('root2', ['a']),
        ]),
      ).toThrow(CategoryDuplicateIdError);
    });

    it('carries the CATEGORY_DUPLICATE_ID code on the thrown error', () => {
      try {
        validateAndResolveReorder(baseSnapshot(), [group('root1', ['a', 'a'])]);
        throw new Error('expected validateAndResolveReorder to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(CategoryDuplicateIdError);
        expect((error as CategoryDuplicateIdError).code).toBe(CategoryErrorCode.DUPLICATE_ID);
      }
    });
  });

  describe('validateAndResolveReorder — unknown ids', () => {
    it('rejects an orderedIds entry that is not in the snapshot', () => {
      expect(() =>
        validateAndResolveReorder(baseSnapshot(), [group('root1', ['a', 'b', 'ghost'])]),
      ).toThrow(CategoryNotFoundError);
    });

    it('rejects a non-null parentId that is not in the snapshot', () => {
      expect(() => validateAndResolveReorder(baseSnapshot(), [group('ghost', ['a'])])).toThrow(
        CategoryNotFoundError,
      );
    });

    it('accepts a null parentId (the root bucket is not a row)', () => {
      expect(() =>
        validateAndResolveReorder(baseSnapshot(), [group(null, ['root2', 'root1'])]),
      ).not.toThrow();
    });
  });

  describe('validateAndResolveReorder — self-parent', () => {
    it('rejects a group whose parentId appears in its own orderedIds', () => {
      expect(() => validateAndResolveReorder(baseSnapshot(), [group('a', ['a', 'a1'])])).toThrow(
        CategorySelfParentError,
      );
    });
  });

  describe('validateAndResolveReorder — cycles', () => {
    it('rejects a single move that puts an ancestor under its own descendant', () => {
      // root1 dropped under a1 (a1 is root1's grandchild)
      expect(() =>
        validateAndResolveReorder(baseSnapshot(), [group('a1', ['a1x', 'root1'])]),
      ).toThrow(CategoryCycleError);
    });

    it('rejects a MULTI-MOVE cycle: a under b and b under a in one payload', () => {
      // Each move is individually legal against the PRE-batch graph (a and b are
      // siblings); only the post-batch adjacency map reveals the cycle.
      expect(() =>
        validateAndResolveReorder(baseSnapshot(), [
          group('a', ['a1', 'b']),
          group('b', ['b1', 'a']),
        ]),
      ).toThrow(CategoryCycleError);
    });
  });

  describe('validateAndResolveReorder — depth (level + height - 1 <= 4)', () => {
    it('rejects a 2-level subtree dropped under a level-3 node (would reach level 5)', () => {
      // b (height 2: b, b1) under a1 (level 3) => 4 + 2 - 1 = 5 > 4
      expect(() => validateAndResolveReorder(baseSnapshot(), [group('a1', ['a1x', 'b'])])).toThrow(
        CategoryMaxDepthError,
      );
    });

    it('ACCEPTS the same 2-level subtree under a level-2 node (level 4 is legal)', () => {
      // b (height 2) under a (level 2) => 3 + 2 - 1 = 4 <= 4
      expect(() =>
        validateAndResolveReorder(baseSnapshot(), [group('a', ['a1', 'b'])]),
      ).not.toThrow();
    });
  });

  describe('validateAndResolveReorder — staleness', () => {
    it('rejects with CATEGORY_TREE_STALE when a DESCRIBED bucket gained a member', () => {
      // 'c' was concurrently reparented into root1; the client does not know about it.
      const snapshot: CategorySnapshotRow[] = [
        ...baseSnapshot(),
        { id: 'c', parentId: 'root1', sortOrder: 2 },
      ];

      expect(() => validateAndResolveReorder(snapshot, [group('root1', ['b', 'a'])])).toThrow(
        CategoryTreeStaleError,
      );
    });

    it('does NOT fire for two same-bucket reorders with equal member sets (last-writer-wins)', () => {
      // The loser of a pure reorder race submits the SAME member set in a different
      // order — membership is unchanged, so this is not staleness.
      expect(() =>
        validateAndResolveReorder(baseSnapshot(), [group('root1', ['b', 'a'])]),
      ).not.toThrow();
    });
  });

  describe('validateAndResolveReorder — write resolution', () => {
    it('accepts an EMPTY orderedIds group (the last child leaves a parent)', () => {
      const writes = validateAndResolveReorder(baseSnapshot(), [
        group(null, ['root1', 'root2', 'b1']),
        group('b', []),
      ]);

      expect(byId(writes)).toEqual([{ id: 'b1', parentId: null, sortOrder: 2 }]);
    });

    it('re-densifies an omitted source bucket found via the affected-parent closure', () => {
      // 'a' moves from root1 to root2; the client never described root1, but the
      // server closure includes it and resequences the survivors to 0..n-1.
      const writes = validateAndResolveReorder(baseSnapshot(), [group('root2', ['a'])]);

      expect(byId(writes)).toEqual([
        { id: 'a', parentId: 'root2', sortOrder: 0 },
        { id: 'b', parentId: 'root1', sortOrder: 0 }, // was sortOrder 1, hole closed
      ]);
    });

    it('omits rows already at their target (parentId + sortOrder)', () => {
      const writes = validateAndResolveReorder(baseSnapshot(), [group('root1', ['a', 'b'])]);

      expect(writes).toEqual([]);
    });

    it('produces contiguous 0..n-1 for a happy-path single-group reorder', () => {
      const writes = validateAndResolveReorder(baseSnapshot(), [group('root1', ['b', 'a'])]);

      expect(byId(writes)).toEqual([
        { id: 'a', parentId: 'root1', sortOrder: 1 },
        { id: 'b', parentId: 'root1', sortOrder: 0 },
      ]);
    });

    it('produces contiguous 0..n-1 for a happy-path two-group reparent', () => {
      // a1 (with its child a1x) moves from 'a' to 'b', landing at the top of 'b'.
      const writes = validateAndResolveReorder(baseSnapshot(), [
        group('a', []),
        group('b', ['a1', 'b1']),
      ]);

      expect(byId(writes)).toEqual([
        { id: 'a1', parentId: 'b', sortOrder: 0 },
        { id: 'b1', parentId: 'b', sortOrder: 1 },
      ]);
    });
  });

  describe('assertMoveDepth (reused by CategoryService.update)', () => {
    it('throws when the moved subtree would exceed the cap', () => {
      expect(() => assertMoveDepth(baseSnapshot(), 'b', 'a1')).toThrow(CategoryMaxDepthError);
    });

    it('passes when the moved subtree fits within 4 levels', () => {
      expect(() => assertMoveDepth(baseSnapshot(), 'b', 'a')).not.toThrow();
    });

    it('passes for a move to the root bucket', () => {
      expect(() => assertMoveDepth(baseSnapshot(), 'a1', null)).not.toThrow();
    });
  });
});
