"use client";

/**
 * Per-row "Дії" menu — the WCAG 2.2 SC 2.5.7 (Dragging Movements) NON-DRAGGING
 * alternative (plan 158 §7.6.1). This is a REQUIREMENT, not polish: keyboard
 * equivalence alone does not satisfy SC 2.5.7, a clickable/tappable alternative
 * is required.
 *
 * EVERY item routes through the SAME `applyIntent`/`applyMove` reducer and the
 * SAME mutation as the keyboard and pointer paths — the menu ⇄ keyboard parity
 * test (TASK-291-J, in the widget spec, because FSD forbids features → widgets)
 * asserts the two produce a byte-identical request body.
 */

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import {
  applyIntent,
  type MoveIntent,
  type TreeItem,
} from "@/shared/lib/sortable-tree";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const t = dict.categories.tree;

export interface CategoryTreeRowActionsProps {
  /** The EFFECTIVE flat tree (the optimistic override while a PATCH is saving). */
  items: TreeItem[];
  categoryId: string;
  name: string;
  isActive: boolean;
  /** Moves are unavailable (a search filter is active, or a PATCH is in flight). */
  disabled?: boolean;
  /** Commit a move — the same `move()` the keyboard and pointer paths call. */
  onMove: (
    next: TreeItem[],
    movingId: string,
    options?: { focusOnSuccess?: boolean },
  ) => void;
  /** Open the "Перемістити до…" dialog for this row. */
  onMoveTo: (categoryId: string) => void;
  /** Activate/deactivate — owned by `features/category-status-toggle` (blast radius). */
  onToggleStatus: () => void;
}

export function CategoryTreeRowActions({
  items,
  categoryId,
  name,
  isActive,
  disabled = false,
  onMove,
  onMoveTo,
  onToggleStatus,
}: CategoryTreeRowActionsProps) {
  const self = items.find((i) => i.id === categoryId);
  const isRoot = self?.parentId === undefined || self?.parentId === null;

  // The preceding sibling is what an INDENT makes this row a child of — its
  // name goes in the item label, so the operator knows where the row will land.
  const siblings = items.filter((i) => i.parentId === (self?.parentId ?? null));
  const selfIndex = siblings.findIndex((i) => i.id === categoryId);
  const previousSibling = selfIndex > 0 ? siblings[selfIndex - 1] : undefined;

  const outcome = (intent: MoveIntent) =>
    applyIntent(items, categoryId, intent);
  const up = outcome("up");
  const down = outcome("down");
  const indent = outcome("indent");
  const outdent = outcome("outdent");

  const run = (result: ReturnType<typeof applyIntent>) => {
    if (result.kind !== "moved") return;
    // §7.5: after a menu move, focus lands on the MOVED ROW — not on this
    // trigger, which may have re-rendered away under the new order.
    onMove(result.items, categoryId, { focusOnSuccess: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t.actionsLabel(name)}
        >
          <MoreHorizontal aria-hidden="true" className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={disabled || up.kind !== "moved"}
          onSelect={() => run(up)}
        >
          {t.moveUp}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={disabled || down.kind !== "moved"}
          onSelect={() => run(down)}
        >
          {t.moveDown}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={disabled || indent.kind !== "moved"}
          onSelect={() => run(indent)}
        >
          {previousSibling ? t.indentUnder(previousSibling.label) : t.indent}
        </DropdownMenuItem>
        {/* Hidden (not merely disabled) at root — there is no level above. */}
        {!isRoot && (
          <DropdownMenuItem
            disabled={disabled || outdent.kind !== "moved"}
            onSelect={() => run(outdent)}
          >
            {t.outdent}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          disabled={disabled}
          onSelect={() => onMoveTo(categoryId)}
        >
          {t.moveTo}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href={`/categories/${categoryId}/edit`}>{t.edit}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onToggleStatus()}>
          {isActive ? t.deactivate : t.activate}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
