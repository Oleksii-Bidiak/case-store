import { treeLockKey } from '../common/reorder';

/**
 * Advisory-lock resource namespace of the category tree (plan 158 §3.8). The key helpers
 * themselves live in `common/reorder/sibling-order.util.ts` so the flat sortable admins
 * (banners / blog-categories / device-brands) reuse the exact same recipe: advisory locks
 * are DATABASE-GLOBAL and every resource has a `__root__` bucket, so without the resource
 * prefix a banner reorder would serialise against a root-category reorder.
 *
 * A dependency-free leaf on purpose: `ProductRepository` takes the same tree key and
 * must not import the category barrel (product ↔ category module cycle).
 */
export const CATEGORY_LOCK_RESOURCE = 'categories';

/**
 * The TREE-SCOPED lock key of the category tree. Held EXCLUSIVELY by every write that
 * changes a node's `parentId` and by `CategoryRepository.deleteSubtreeWithMove` for the
 * whole delete (TASK-652). Taken in SHARED mode by every product write that files a
 * product under a category — `ProductRepository.create`, a category-writing `update`
 * (TASK-1772) and `restore` (TASK-656/1835) — each of which then re-checks that the
 * category is live, so no product can commit pointing at a category a concurrent delete
 * tombstones (invariant I1).
 */
export const CATEGORY_TREE_LOCK_KEY = treeLockKey(CATEGORY_LOCK_RESOURCE);
