"use client";

/**
 * The category treegrid's Undo control — a label binding of the shared
 * `ReorderUndoButton` (plan 158 §5 TASK-291-I, §7.6.4).
 *
 * The behaviour (a real toolbar button rather than a toast action; stays in the
 * tab order and goes `aria-disabled` — never `disabled` — outside the ~30 s
 * window) lives in `shared/ui` since TASK-295, so the flat sortable lists get the
 * same control rather than a fork of it.
 */

import { ReorderUndoButton } from "@/shared/ui";
import { dict } from "@/shared/config";

export interface CategoryReorderUndoButtonProps {
  canUndo: boolean;
  onUndo: () => void;
  /**
   * Wave 198 (TASK-963): the tree's toolbar shows it as an icon — the visible
   * way back is the «Скасувати» toast now — while it stays in the tab order
   * for keyboard and screen-reader users.
   */
  iconOnly?: boolean;
}

export function CategoryReorderUndoButton({
  canUndo,
  onUndo,
  iconOnly,
}: CategoryReorderUndoButtonProps) {
  return (
    <ReorderUndoButton
      canUndo={canUndo}
      onUndo={onUndo}
      label={dict.categories.tree.undo}
      iconOnly={iconOnly}
    />
  );
}
