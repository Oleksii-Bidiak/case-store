"use client";

import { Button, RegistryBulkBar } from "@/shared/ui";
import { dict } from "@/shared/config";

const tree = dict.categories.tree;
const t = tree.bulk;

export interface CategoryBulkActionsBarProps {
  selectedCount: number;
  isPending: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onClear: () => void;
}

/**
 * The bulk-action bar (TASK-293), on the registry's bar since wave 198
 * (CategoriesProposal КТ1/КТ3).
 *
 * ALWAYS there now: idle, it is a dashed hint that teaches what ticking a row
 * is for (and that rows are dragged by ⠿); active, it carries the count and
 * «Показувати на сайті (N)» / «Приховати (N)» / «Зняти вибір». A bar that
 * popped in used to push the tree down under the cursor at the exact moment
 * the operator ticked a box.
 *
 * The count is a `role="status"` region inside `RegistryBulkBar`, so a screen
 * reader still hears the selection change without focus leaving the grid.
 */
export function CategoryBulkActionsBar({
  selectedCount,
  isPending,
  onActivate,
  onDeactivate,
  onClear,
}: CategoryBulkActionsBarProps) {
  return (
    <RegistryBulkBar
      selectedCount={selectedCount}
      itemForms={tree.bulkItemForms}
      idleHint={tree.bulkIdleHint}
      isPending={isPending}
      // The tree is one page: there is nothing for a selection to be «kept» across.
      showKeptHint={false}
      onClear={onClear}
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={onActivate}
          >
            {t.activate(selectedCount)}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={onDeactivate}
          >
            {t.deactivate(selectedCount)}
          </Button>
        </>
      }
    />
  );
}
