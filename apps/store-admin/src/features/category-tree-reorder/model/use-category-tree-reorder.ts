"use client";

/**
 * The category-tree adapter over the shared reorder lifecycle (plan 158 §3.11 /
 * §5 TASK-291-I / §7.3 / §7.5; the lifecycle itself moved to
 * `shared/lib/list-reorder/use-reorder-lifecycle.ts` in TASK-295).
 *
 * Everything that is a RULE — single in-flight PATCH, the optimistic override,
 * the write-back of the server tree, the 30 s undo, the guarded 409 recovery —
 * now lives in the shared hook and is shared with the three flat admin lists.
 * What stays here is what is genuinely CATEGORY-specific:
 *
 * - the wire payload (`toReorderGroups` → `{ groups }`, tree-shaped: the affected
 *   parent buckets, not one flat `orderedIds`);
 * - the error table (`CATEGORY_CYCLE` / `CATEGORY_MAX_DEPTH` / … — flat lists have
 *   no cycle, depth or self-parent failure mode);
 * - the announcements, which carry the tree's level and parent name.
 *
 * The public API (`CategoryTreeReorderApi`) is UNCHANGED.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  flattenAdminCategoryTree,
  getCategoryControllerGetAdminTreeQueryKey,
  getCategoryControllerGetAdminTreeQueryOptions,
  useAdminCategoryControllerReorder,
  type AdminCategoryTreeResponse,
  type ReorderCategoriesDto,
} from "@/entities/category";
import {
  levelOf,
  toReorderGroups,
  type TreeItem,
} from "@/shared/lib/sortable-tree";
import {
  useReorderLifecycle,
  type ReorderLifecycleApi,
  type ReorderLifecycleStrings,
  type ReorderMoveOptions,
} from "@/shared/lib/list-reorder";
import { dict } from "@/shared/config";

export { CONFLICT_FLAG_MS, UNDO_WINDOW_MS } from "@/shared/lib/list-reorder";

const a = dict.reorderTree.announce;
const rejected = dict.reorderTree.rejected;
const m = dict.categories.tree.movedToast;

/** The admin-tree query key. Parameterless, so it is a module constant. */
const TREE_KEY = getCategoryControllerGetAdminTreeQueryKey();

/** Re-exported under its historical name — the widget and the row menu use it. */
export type MoveOptions = ReorderMoveOptions;

export type CategoryTreeReorderApi = ReorderLifecycleApi;

/** Position of `id` among its siblings, plus its level and parent name. */
function describe(items: TreeItem[], id: string) {
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  // Array order within a bucket IS the sibling order; `filter` preserves it.
  const siblings = items.filter((i) => i.parentId === item.parentId);
  const parent =
    item.parentId === null
      ? null
      : (items.find((i) => i.id === item.parentId)?.label ?? null);
  return {
    name: item.label,
    pos: siblings.findIndex((i) => i.id === id) + 1,
    size: siblings.length,
    level: levelOf(items).get(id) ?? 1,
    parent,
    parentLabel: parent ?? dict.categories.root,
  };
}

/**
 * What the «Скасувати» toast says after a move (wave 198, TASK-963): where the
 * row WENT, in the operator's words — «вкладено в», «тепер коренева», or the
 * new position among the same siblings.
 */
export function movedToastMessage(
  prev: TreeItem[],
  next: TreeItem[],
  movingId: string,
): string | null {
  const before = prev.find((i) => i.id === movingId);
  const after = describe(next, movingId);
  if (!before || !after) return null;
  const parentId = next.find((i) => i.id === movingId)?.parentId ?? null;
  if (parentId !== before.parentId) {
    return after.parent === null
      ? m.root(after.name)
      : m.nested(after.name, after.parent);
  }
  return m.reordered(after.name, after.pos, after.size);
}

interface PendingMove {
  prev: TreeItem[];
  next: TreeItem[];
  movingId: string;
}

export interface UseCategoryTreeReorderOptions {
  /** The flattened SERVER tree (what the query holds). */
  items: TreeItem[];
  /** Focus a treegrid row by category id — owned by the widget. */
  onFocusRow?: (id: string) => void;
}

export function useCategoryTreeReorder({
  items,
  onFocusRow,
}: UseCategoryTreeReorderOptions): CategoryTreeReorderApi {
  const queryClient = useQueryClient();
  const reorder = useAdminCategoryControllerReorder();
  const { mutate: rawMutate } = reorder;

  const toPayload = useCallback(
    (from: TreeItem[], to: TreeItem[]): ReorderCategoriesDto | null => {
      const groups = toReorderGroups(from, to);
      return groups.length === 0 ? null : { groups };
    },
    [],
  );

  /**
   * The move the NEXT `mutate` call belongs to (wave 198, TASK-963). Set by the
   * wrapped `move` just before it hands over to the lifecycle and claimed
   * synchronously by `mutate` — the lifecycle calls `mutate` inside `move` or
   * not at all — so a move the lifecycle refused (busy, no-op) leaves nothing
   * behind for a later undo to pick up. An undo's `mutate` finds it empty and
   * therefore posts no toast.
   */
  const pendingMoveRef = useRef<PendingMove | null>(null);
  /** The live «Скасувати» toast, so a newer move or an undo can retire it. */
  const toastIdRef = useRef<string | number | null>(null);
  /** The toast's action calls the CURRENT undo, not the one of its render. */
  const undoRef = useRef<() => void>(() => undefined);

  const mutate = useCallback(
    (
      payload: ReorderCategoriesDto,
      callbacks: {
        onSuccess: (response: AdminCategoryTreeResponse) => void;
        onError: (error: unknown) => void;
        onSettled: () => void;
      },
    ) => {
      const moved = pendingMoveRef.current;
      pendingMoveRef.current = null;
      rawMutate(
        { data: payload },
        {
          ...callbacks,
          onSuccess: (response) => {
            callbacks.onSuccess(response);
            if (!moved) return;
            const message = movedToastMessage(
              moved.prev,
              moved.next,
              moved.movingId,
            );
            if (!message) return;
            // One undo on offer at a time: the older toast would now undo the
            // NEWER move, which is not what its words say.
            if (toastIdRef.current !== null) toast.dismiss(toastIdRef.current);
            toastIdRef.current = toast.undo(message, {
              onUndo: () => undoRef.current(),
            });
          },
        },
      );
    },
    [rawMutate],
  );

  /**
   * `fetchQuery`, not `refetchQueries`: the latter only touches queries that
   * already have an observer, so it silently no-ops if the tree is read anywhere
   * other than a currently-mounted component. `fetchQuery` resolves with the
   * fresh tree AND writes it into the cache, which is what every mounted observer
   * re-renders from.
   */
  const refetch = useCallback(
    () =>
      queryClient
        .fetchQuery(getCategoryControllerGetAdminTreeQueryOptions())
        .then((fresh: AdminCategoryTreeResponse) =>
          flattenAdminCategoryTree(fresh?.data),
        ),
    [queryClient],
  );

  const strings = useMemo<ReorderLifecycleStrings>(
    () => ({
      saving: a.saving,
      busyRefused: a.busyRefused,
      undone: a.undone,
      conflict: rejected.CATEGORY_TREE_STALE,

      rejected: ({ code, movingId, before, attempted }) => {
        const name = before.find((i) => i.id === movingId)?.label ?? "";
        switch (code) {
          case "CATEGORY_CYCLE": {
            // The target name is the parent the operator AIMED at — resolved from
            // the attempted tree, because the server deliberately sends no ids on
            // the wire (§3.5: the admin initiated the move, so the client already
            // knows both ends).
            const targetId =
              attempted.find((i) => i.id === movingId)?.parentId ?? null;
            const target =
              before.find((i) => i.id === targetId)?.label ??
              dict.categories.root;
            return rejected.CATEGORY_CYCLE(name, target);
          }
          case "CATEGORY_MAX_DEPTH":
            return rejected.CATEGORY_MAX_DEPTH;
          case "CATEGORY_SELF_PARENT":
            return rejected.CATEGORY_SELF_PARENT(name);
          case "CATEGORY_DUPLICATE_ID":
            return rejected.CATEGORY_DUPLICATE_ID(name);
          case "CATEGORY_NOT_FOUND":
            return rejected.CATEGORY_NOT_FOUND(name);
          case undefined:
          case "":
            // No coded body at all ⇒ network / 500.
            return dict.reorderTree.saveFailed(name);
          default:
            // A code we do not recognise. NEVER announce a raw backend string and
            // NEVER leave the region empty.
            return dict.reorderTree.rejectedUnknown(name);
        }
      },

      committed: (prev, next, movingId) => {
        const from = describe(prev, movingId);
        const to = describe(next, movingId);
        if (!from || !to) return null;
        return a.committed(
          to.name,
          to.pos,
          to.size,
          to.parentLabel,
          from.pos,
          from.size,
          from.parentLabel,
        );
      },

      positionAfterConflict: (fresh, movingId) => {
        const at = describe(fresh, movingId);
        if (!at) return null;
        return a.positionAfterConflict(
          at.name,
          at.pos,
          at.size,
          at.level,
          at.parent,
        );
      },
    }),
    [],
  );

  const isConflict = useCallback(
    (status: number | undefined, code: string | undefined) =>
      status === 409 || code === "CATEGORY_TREE_STALE",
    [],
  );

  const lifecycle = useReorderLifecycle<
    ReorderCategoriesDto,
    AdminCategoryTreeResponse
  >({
    resource: "categories",
    items,
    toPayload,
    mutate,
    isPending: reorder.isPending,
    queryKey: TREE_KEY,
    refetch,
    strings,
    onFocusRow,
    isConflict,
  });

  const {
    items: effective,
    move: lifecycleMove,
    undo: lifecycleUndo,
  } = lifecycle;

  const move = useCallback<CategoryTreeReorderApi["move"]>(
    (next, movingId, options) => {
      pendingMoveRef.current = { prev: effective, next, movingId };
      lifecycleMove(next, movingId, options);
      pendingMoveRef.current = null;
    },
    [effective, lifecycleMove],
  );

  // The persistent control and the toast offer the SAME undo; whichever the
  // operator uses, the other must not keep offering it.
  const undo = useCallback(() => {
    if (toastIdRef.current !== null) {
      toast.dismiss(toastIdRef.current);
      toastIdRef.current = null;
    }
    lifecycleUndo();
  }, [lifecycleUndo]);

  useEffect(() => {
    undoRef.current = undo;
  }, [undo]);

  // A toast that outlives the screen would undo into an unmounted grid.
  useEffect(
    () => () => {
      if (toastIdRef.current !== null) toast.dismiss(toastIdRef.current);
    },
    [],
  );

  return useMemo<CategoryTreeReorderApi>(
    () => ({ ...lifecycle, move, undo }),
    [lifecycle, move, undo],
  );
}
