"use client";

/**
 * The PERSISTENT Undo control for any reorder (plan 158 §5 TASK-291-I, §7.6.4;
 * hoisted to `shared/ui` in TASK-295 so the category treegrid and the three flat
 * sortable lists share ONE implementation).
 *
 * A toolbar button — NOT (only) a `sonner` toast action. A toast never receives
 * focus, is not discoverable in the tab order and expires, so it cannot be the
 * accessible entry point for reversing a move. The commit announcement (§7.3)
 * names THIS control by its label.
 *
 * Outside the ~30 s window it stays in the tab order and is `aria-disabled` —
 * never `disabled`, which would remove it from the tab order and make the
 * announcement's promise ("скористайтеся кнопкою …") a lie for keyboard users.
 */

import { Button } from "./button";

export interface ReorderUndoButtonProps {
  canUndo: boolean;
  onUndo: () => void;
  /** The control's visible label — the same string the commit announcement names. */
  label: string;
}

export function ReorderUndoButton({
  canUndo,
  onUndo,
  label,
}: ReorderUndoButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-disabled={!canUndo}
      className={canUndo ? undefined : "opacity-50"}
      onClick={() => {
        if (!canUndo) return;
        onUndo();
      }}
    >
      {label}
    </Button>
  );
}
