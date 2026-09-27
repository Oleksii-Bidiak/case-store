"use client";

import { useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { StatusToggleButton } from "@/shared/ui/status-toggle-button";
import { dict } from "@/shared/config";
import { isReorderInFlight } from "@/shared/lib/reorder-lock";
import {
  getAdminCategoryControllerFindAllWithProductCountQueryKey,
  getCategoryControllerGetAdminTreeQueryKey,
  useAdminCategoryControllerActivate,
  useAdminCategoryControllerDeactivate,
} from "@/entities/category";
import { useStatusToggle } from "@/features/bulk-status";

export interface UseCategoryStatusToggleOptions {
  categoryId: string;
  isActive: boolean;
  /** Row name — only needed for the blast-radius confirmation copy. */
  name?: string;
  /**
   * How many descendants this category has, computed from the tree ALREADY in
   * memory (no extra request). `0` (a leaf) ⇒ NO confirmation at all.
   */
  descendantCount?: number;
  /** Called when the operator cancels the confirmation — restores focus (§7.5). */
  onCancel?: () => void;
}

export interface CategoryStatusToggleApi {
  toggle: () => void;
  isPending: boolean;
  /** The blast-radius prompt (TASK-812) — render once in the caller's JSX. */
  confirmDialog: ReactNode;
}

/**
 * Activate/deactivate a category, with the mandatory blast-radius warning
 * (plan 158 §3.11).
 *
 * The mechanism is BINDING: a confirmation BEFORE the write — an AlertDialog
 * since TASK-812 (`window.confirm` before it), NOT a toast. A toast fires AFTER
 * the write and therefore cannot satisfy "state the blast radius BEFORE it
 * commits". `findCategoryTree` filters `isActive` at EVERY level, so
 * deactivating a parent hides its still-ACTIVE children from the storefront —
 * and the tree UI puts those children right on screen, making the operator MORE
 * likely to believe they are unaffected.
 *
 * Cancel ⇒ ZERO mutation calls. A LEAF shows no confirmation at all.
 *
 * Exported as a hook as well as a button so the per-row "Дії" menu
 * (`features/category-tree-row-actions`) routes its Активувати/Деактивувати item
 * through the SAME blast-radius guard instead of re-deriving it. A hook caller
 * must render the returned `confirmDialog`.
 */
export function useCategoryStatusToggle({
  categoryId,
  isActive,
  name = "",
  descendantCount = 0,
  onCancel,
}: UseCategoryStatusToggleOptions): CategoryStatusToggleApi {
  const queryClient = useQueryClient();
  const activate = useAdminCategoryControllerActivate();
  const deactivate = useAdminCategoryControllerDeactivate();

  return useStatusToggle({
    id: categoryId,
    isActive,
    activate,
    deactivate,
    confirmDeactivate:
      descendantCount > 0
        ? {
            description: dict.categories.tree.deactivateConfirm(
              name,
              descendantCount,
            ),
            confirmLabel: dict.common.deactivate,
            destructive: true,
          }
        : null,
    onCancel,
    onWritten: () => {
      void queryClient.invalidateQueries({
        queryKey: getAdminCategoryControllerFindAllWithProductCountQueryKey(),
      });
      // §3.11: NOTHING invalidates the admin-tree query key today, so a
      // status toggle would leave the treegrid stale until a hard reload.
      // Suppressed while a reorder PATCH is in flight: refetching mid-move
      // pulls the PRE-move server tree in under the optimistic override.
      // Keyed by resource (TASK-295): a banner or brand reorder elsewhere in
      // the app must NOT suppress the category tree's invalidation.
      if (!isReorderInFlight("categories")) {
        void queryClient.invalidateQueries({
          queryKey: getCategoryControllerGetAdminTreeQueryKey(),
        });
      }
    },
  });
}

export interface CategoryStatusToggleProps {
  categoryId: string;
  isActive: boolean;
  name?: string;
  descendantCount?: number;
}

/**
 * One-click activate/deactivate control rendered in the category tree.
 * Cancelling the blast-radius confirmation returns focus to THIS button (§7.5).
 */
export function CategoryStatusToggle({
  categoryId,
  isActive,
  name,
  descendantCount,
}: CategoryStatusToggleProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { toggle, isPending, confirmDialog } = useCategoryStatusToggle({
    categoryId,
    isActive,
    name,
    descendantCount,
    onCancel: () => buttonRef.current?.focus(),
  });

  return (
    <>
      <StatusToggleButton
        ref={buttonRef}
        isActive={isActive}
        isPending={isPending}
        onToggle={toggle}
        activateLabel={dict.statusToggle.categoryActivate}
        deactivateLabel={dict.statusToggle.categoryDeactivate}
      />
      {confirmDialog}
    </>
  );
}
