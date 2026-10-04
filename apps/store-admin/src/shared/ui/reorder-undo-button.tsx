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

import { Undo2Icon } from "lucide-react";
import { Button } from "./button";

export interface ReorderUndoButtonProps {
  canUndo: boolean;
  onUndo: () => void;
  /** The control's visible label — the same string the commit announcement names. */
  label: string;
  /**
   * Wave 198 (Categories, TASK-963): a toolbar icon instead of a text button,
   * for screens where a «Скасувати» toast is the visible way back. The label
   * stays the accessible name (and the tooltip), so the commit announcement
   * still names a control that exists.
   */
  iconOnly?: boolean;
}

/**
 * TASK-963: the unavailable state is painted with the `disabled` tokens, not
 * `opacity-50` — fading grey text on grey dropped it to ≈2:1. `aria-disabled`
 * does not trigger the Button's own `disabled:` styles, hence the classes here.
 */
const UNAVAILABLE =
  "border-transparent bg-disabled text-disabled-foreground shadow-none hover:bg-disabled hover:text-disabled-foreground";

export function ReorderUndoButton({
  canUndo,
  onUndo,
  label,
  iconOnly = false,
}: ReorderUndoButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size={iconOnly ? "icon-sm" : "sm"}
      aria-disabled={!canUndo}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      className={canUndo ? undefined : UNAVAILABLE}
      onClick={() => {
        if (!canUndo) return;
        onUndo();
      }}
    >
      {iconOnly ? <Undo2Icon aria-hidden="true" /> : label}
    </Button>
  );
}
