"use client";

/**
 * «Перемістити до…» — the second mandatory non-dragging alternative
 * (plan 158 §7.6.2, WCAG 2.2 SC 2.5.7). It is also the only affordance that
 * moves a node ACROSS the tree in ONE action instead of N indent/outdent steps,
 * and it is the direct replacement for the deleted `sortOrder` number input.
 *
 * The parent `<Select>` is fed from `useCategoryControllerGetAdminTree` — the
 * COMPLETE admin tree — NOT from the 100-row-capped flat admin list (§3.11):
 * a capped page is a PARTIAL graph, so a descendant beyond the cap is simply
 * absent and a descendant-exclusion computed over it silently UNDER-excludes.
 * SELF and ALL DESCENDANTS are excluded here; targets that would violate
 * `level + height − 1 ≤ 4` are excluded too (the reducer would refuse them
 * anyway — never offer a dead end).
 *
 * Submits through the SAME `applyMove` reducer and the SAME mutation as the
 * keyboard, pointer and row-menu paths.
 */

import { useState } from "react";
import {
  flattenAdminCategoryTree,
  useCategoryControllerGetAdminTree,
} from "@/entities/category";
import {
  MAX_TREE_LEVELS,
  applyMove,
  descendantsOf,
  levelOf,
  subtreeHeight,
  type TreeItem,
} from "@/shared/lib/sortable-tree";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const d = dict.categories.tree.moveDialog;
const ROOT_OPTION = "__root__";

export interface CategoryMoveToDialogProps {
  /** The row being moved. `null` closes the dialog. */
  categoryId: string | null;
  onOpenChange: (open: boolean) => void;
  /** The same `move()` the keyboard/pointer/menu paths call. */
  onMove: (
    next: TreeItem[],
    movingId: string,
    options?: { focusOnSuccess?: boolean },
  ) => void;
}

export function CategoryMoveToDialog({
  categoryId,
  onOpenChange,
  onMove,
}: CategoryMoveToDialogProps) {
  const treeQuery = useCategoryControllerGetAdminTree();
  const items = flattenAdminCategoryTree(treeQuery.data?.data);

  const [parentValue, setParentValue] = useState<string>(ROOT_OPTION);
  const [positionValue, setPositionValue] = useState<number>(1);

  const self = categoryId ? items.find((i) => i.id === categoryId) : undefined;

  /**
   * forms.md Rule 1a — render-time sync guard (NOT a `key`-remount, NOT a bare
   * `useState(prop)`). The seed key is (row id + "tree has loaded"), so the two
   * selects are seeded EXACTLY once per opened row: a background refetch never
   * clobbers a choice the operator has already made.
   */
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const seedKey = self ? `${self.id}:${items.length}` : null;
  if (self && seedKey !== null && seedKey !== seededFor) {
    const currentSiblings = items.filter((i) => i.parentId === self.parentId);
    setSeededFor(seedKey);
    setParentValue(self.parentId ?? ROOT_OPTION);
    setPositionValue(
      currentSiblings.findIndex((i) => i.id === self.id) + 1 || 1,
    );
  }
  if (seedKey === null && seededFor !== null) {
    setSeededFor(null);
  }

  // Legal destinations: everything except SELF, its DESCENDANTS, and any parent
  // that would push the moving subtree past the 4-level structural cap.
  const excluded = categoryId
    ? descendantsOf(items, categoryId)
    : new Set<string>();
  const levels = levelOf(items);
  const height = categoryId ? subtreeHeight(items, categoryId) : 1;
  const parentOptions = items.filter((item) => {
    if (item.id === categoryId) return false;
    if (excluded.has(item.id)) return false;
    const level = levels.get(item.id) ?? 1;
    return level + 1 + height - 1 <= MAX_TREE_LEVELS;
  });

  const targetParentId = parentValue === ROOT_OPTION ? null : parentValue;
  const destination = items.filter(
    (i) => i.parentId === targetParentId && i.id !== categoryId,
  );
  const slots = destination.length + 1;
  const positions = Array.from({ length: slots }, (_, i) => i + 1);
  const position = Math.min(positionValue, slots);

  const handleSubmit = () => {
    if (!categoryId) return;
    const next = applyMove(items, categoryId, {
      targetParentId,
      targetIndex: position - 1,
    });
    if (!next) return; // never happens — illegal targets are not offered
    // §7.5: focus the MOVED ROW on success, not this (unmounted) dialog trigger.
    onMove(next, categoryId, { focusOnSuccess: true });
    onOpenChange(false);
  };

  return (
    <Dialog open={categoryId !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{d.title(self?.label ?? "")}</DialogTitle>
          <DialogDescription>{d.description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category-move-parent">{d.parentLabel}</Label>
            <Select
              value={parentValue}
              onValueChange={(value) => {
                if (value === "") return; // Radix bubble-input bounce (TASK-201)
                setParentValue(value);
                setPositionValue(Number.MAX_SAFE_INTEGER); // append by default
              }}
            >
              <SelectTrigger id="category-move-parent">
                <SelectValue
                  placeholder={treeQuery.isLoading ? d.loading : d.rootOption}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROOT_OPTION}>{d.rootOption}</SelectItem>
                {parentOptions.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category-move-position">{d.positionLabel}</Label>
            <Select
              value={String(position)}
              onValueChange={(value) => {
                if (value === "") return;
                setPositionValue(Number(value));
              }}
            >
              <SelectTrigger id="category-move-position">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {positions.map((pos) => (
                  <SelectItem key={pos} value={String(pos)}>
                    {d.positionOption(pos, slots)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {d.cancel}
          </Button>
          <Button type="button" onClick={handleSubmit}>
            {d.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
