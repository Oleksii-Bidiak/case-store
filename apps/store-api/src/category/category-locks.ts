import { treeLockKey } from '../common/reorder';

/**
 * Advisory-lock resource namespace of the category tree (plan 158 §3.8). The key helpers
 * themselves live in `common/reorder/sibling-order.util.ts` so the flat sortable admins
 * (banners / blog-categories / device-brands) reuse the exact same recipe: advisory locks
 * are DATABASE-GLOBAL and every resource has a `__root__` bucket, so without the resource
 * prefix a banner reorder would serialise against a root-category reorder.
 *
 * A dependency-free leaf on purpose: `ProductRepository.restore` takes the same tree key
 * and must not import the category barrel (product ↔ category module cycle).
 */
export const CATEGORY_LOCK_RESOURCE = 'categories';

/**
 * The TREE-SCOPED lock key of the category tree. Held by every write that changes a
 * node's `parentId` and by `CategoryRepository.deleteSubtreeWithMove` for the whole
 * delete (TASK-652), and taken by `ProductRepository.restore` (TASK-656) so a restore
 * cannot interleave with a category delete and bring a product back into a tombstone.
 */
export const CATEGORY_TREE_LOCK_KEY = treeLockKey(CATEGORY_LOCK_RESOURCE);
