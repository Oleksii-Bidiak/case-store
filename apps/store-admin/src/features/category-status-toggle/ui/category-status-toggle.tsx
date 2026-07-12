"use client";

import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Button } from "@/shared/ui";
import { dict } from "@/shared/config";
import { isReorderInFlight } from "@/shared/lib/reorder-lock";
import {
  getAdminCategoryControllerFindAllWithProductCountQueryKey,
  getCategoryControllerGetAdminTreeQueryKey,
  useAdminCategoryControllerActivate,
  useAdminCategoryControllerDeactivate,
} from "@/entities/category";

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

/**
 * Activate/deactivate a category, with the mandatory blast-radius warning
 * (plan 158 §3.11).
 *
 * The mechanism is BINDING: a `window.confirm` (the TASK-285 precedent in
 * `widgets/category-form-view/ui/edit-category-view.tsx`), NOT a toast — a toast
 * fires AFTER the write and therefore cannot satisfy "state the blast radius
 * BEFORE it commits". `findCategoryTree` filters `isActive` at EVERY level, so
 * deactivating a parent hides its still-ACTIVE children from the storefront —
 * and the tree UI puts those children right on screen, making the operator MORE
 * likely to believe they are unaffected.
 *
 * Cancel ⇒ ZERO mutation calls. A LEAF shows no confirmation at all.
 *
 * Exported as a hook as well as a button so the per-row "Дії" menu
 * (`features/category-tree-row-actions`) routes its Активувати/Деактивувати item
 * through the SAME blast-radius guard instead of re-deriving it.
 */
export function useCategoryStatusToggle({
  categoryId,
  isActive,
  name = "",
  descendantCount = 0,
  onCancel,
}: UseCategoryStatusToggleOptions) {
  const queryClient = useQueryClient();
  const activate = useAdminCategoryControllerActivate();
  const deactivate = useAdminCategoryControllerDeactivate();

  const isPending = activate.isPending || deactivate.isPending;
  const mutation = isActive ? deactivate : activate;

  const toggle = useCallback(() => {
    if (isPending) return;

    if (isActive && descendantCount > 0) {
      const confirmed = window.confirm(
        dict.categories.tree.deactivateConfirm(name, descendantCount),
      );
      if (!confirmed) {
        onCancel?.();
        return;
      }
    }

    mutation.mutate(
      { id: categoryId },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey:
              getAdminCategoryControllerFindAllWithProductCountQueryKey(),
          });
          // §3.11: NOTHING invalidates the admin-tree query key today, so a
          // status toggle would leave the treegrid stale until a hard reload.
          // Suppressed while a reorder PATCH is in flight: refetching mid-move
          // pulls the PRE-move server tree in under the optimistic override.
          if (!isReorderInFlight()) {
            void queryClient.invalidateQueries({
              queryKey: getCategoryControllerGetAdminTreeQueryKey(),
            });
          }
        },
      },
    );
  }, [
    categoryId,
    descendantCount,
    isActive,
    isPending,
    mutation,
    name,
    onCancel,
    queryClient,
  ]);

  return { toggle, isPending };
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

  const { toggle, isPending } = useCategoryStatusToggle({
    categoryId,
    isActive,
    name,
    descendantCount,
    onCancel: () => buttonRef.current?.focus(),
  });

  return (
    <Button
      ref={buttonRef}
      type="button"
      variant="ghost"
      size="sm"
      onClick={toggle}
      disabled={isPending}
      aria-label={
        isActive
          ? dict.statusToggle.categoryDeactivate
          : dict.statusToggle.categoryActivate
      }
    >
      <Badge variant={isActive ? "default" : "secondary"}>
        {isActive ? dict.common.active : dict.common.inactive}
      </Badge>
    </Button>
  );
}
