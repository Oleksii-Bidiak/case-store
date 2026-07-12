"use client";

import {
  useCategoryControllerGetAdminTree,
  type AdminCategoryTreeResponse,
} from "@/entities/category";
import type { ErrorType } from "@/shared/api";

/**
 * The treegrid's read query, with `refetchOnWindowFocus` DISABLED (plan 158 §5,
 * TASK-291-I).
 *
 * A window-focus refetch is normally harmless, but here it can land in the
 * middle of a move: it would replace the tree under an in-flight PATCH's
 * optimistic override, or under a half-finished keyboard move-mode preview, and
 * the operator would watch rows jump. The tree is invalidated explicitly by
 * every writer instead (status toggle, create view, edit view, reorder).
 */
export function useAdminCategoryTreeQuery() {
  return useCategoryControllerGetAdminTree<
    AdminCategoryTreeResponse,
    ErrorType<void>
  >({
    query: { refetchOnWindowFocus: false },
  });
}
