"use client";

/**
 * The category-tree mutation lifecycle (plan 158 §3.11 / §5 TASK-291-I / §7.3 / §7.5).
 *
 * This is the FIRST optimistic mutation in store-admin — every other mutation in
 * the app is invalidate-on-success — so the rules are spelled out here rather
 * than copied from a precedent that does not exist:
 *
 * 1. SINGLE IN-FLIGHT PATCH. The guard is a ref, not `mutation.isPending`:
 *    `isPending` only flips on the next render, so two synchronous key presses
 *    would both pass an `isPending` check. A refused second move fires NO
 *    request and politely announces «Зачекайте, попереднє переміщення ще
 *    зберігається.»
 * 2. A `pendingTree` OVERRIDE, not `setQueryData` cache surgery. The optimistic
 *    tree is component state that SHADOWS the query data while the PATCH is in
 *    flight and is dropped in `onSettled`. Rollback is therefore "stop
 *    overriding" — there is no cache state to restore, and a concurrent
 *    background refetch cannot resurrect a half-applied optimistic write.
 * 3. On success the SERVER-RETURNED tree is written into the cache (the endpoint
 *    returns the full refreshed tree, §6), so the client resynchronises in one
 *    round trip, and the INVERSE payload (`toReorderGroups(next, prev)`) is kept
 *    for the persistent Undo control (~30 s window).
 * 4. On error: drop the override, re-focus the moved row, announce the
 *    error-code-keyed assertive string (mirrored to `toast.error`).
 *    `CATEGORY_TREE_STALE` (409) additionally refetches, re-focuses the
 *    operator's node, politely announces its NEW position, and flags every row
 *    whose parent/position changed for ~5 s.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  flattenAdminCategoryTree,
  getCategoryControllerGetAdminTreeQueryKey,
  getCategoryControllerGetAdminTreeQueryOptions,
  useAdminCategoryControllerReorder,
  type AdminCategoryTreeResponse,
  type ReorderGroupDto,
} from "@/entities/category";
import {
  levelOf,
  toReorderGroups,
  type TreeItem,
} from "@/shared/lib/sortable-tree";
import { beginReorder, endReorder } from "@/shared/lib/reorder-lock";
import { useAnnouncer } from "@/shared/ui";
import { dict } from "@/shared/config";

/** How long the persistent Undo control stays enabled after a commit. */
export const UNDO_WINDOW_MS = 30_000;
/** How long rows changed by a CONCURRENT admin stay visually flagged after a 409. */
export const CONFLICT_FLAG_MS = 5_000;

const a = dict.reorderTree.announce;
const rejected = dict.reorderTree.rejected;

/** The admin-tree query key. Parameterless, so it is a module constant — a
 *  per-render call would give every callback a new identity. */
const TREE_KEY = getCategoryControllerGetAdminTreeQueryKey();

interface MoveOptions {
  /**
   * Focus the moved row on success. The keyboard path leaves this off (focus is
   * already on the row); the row menu and the "Перемістити до…" dialog set it,
   * because §7.5 requires focus to land on the MOVED ROW, not on a trigger that
   * may have re-rendered away.
   */
  focusOnSuccess?: boolean;
}

export interface CategoryTreeReorderApi {
  /** What the UI must render: the optimistic override while saving, else the server tree. */
  items: TreeItem[];
  /** A PATCH is in flight — drives `aria-busy` on the treegrid. */
  isPending: boolean;
  /** The persistent Undo control is live (a commit happened < 30 s ago and nothing is saving). */
  canUndo: boolean;
  /** Rows another admin moved under us (409) — flagged for ~5 s. */
  conflictIds: ReadonlySet<string>;
  /** Commit a move produced by `applyMove`/`applyIntent`. */
  move: (next: TreeItem[], movingId: string, options?: MoveOptions) => void;
  /** Replay the exact inverse payload of the last commit. */
  undo: () => void;
}

interface UndoState {
  groups: ReorderGroupDto[];
  movingId: string;
  expiresAt: number;
}

/** The shape the backend error envelope reaches us in (`HttpExceptionFilter`). */
interface ApiErrorLike {
  response?: { status?: number; data?: { error?: string } };
}

const ROOT = "__root__";

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

/** Ids whose parent OR position among siblings differs between two trees. */
function changedRowIds(before: TreeItem[], after: TreeItem[]): Set<string> {
  const index = (list: TreeItem[]) => {
    const seen = new Map<string, number>();
    const out = new Map<string, string>();
    for (const item of list) {
      const key = item.parentId ?? ROOT;
      const at = seen.get(key) ?? 0;
      seen.set(key, at + 1);
      out.set(item.id, `${key}#${at}`);
    }
    return out;
  };
  const b = index(before);
  const changed = new Set<string>();
  for (const [id, slot] of index(after)) {
    if (b.has(id) && b.get(id) !== slot) changed.add(id);
  }
  return changed;
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
  const { announcePolite, announceAssertive } = useAnnouncer();
  const reorder = useAdminCategoryControllerReorder();

  const [pendingTree, setPendingTree] = useState<TreeItem[] | null>(null);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [conflictIds, setConflictIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  /**
   * SYNCHRONOUS single-in-flight guard. `reorder.isPending` is derived state and
   * only becomes true on the next render — a second key press inside the same
   * tick would sail straight past it and fire a second PATCH.
   */
  const inFlightRef = useRef(false);

  /** What the UI renders: the optimistic override while saving, else the server tree. */
  const effective = pendingTree ?? items;

  // Expire the Undo window so the control goes `aria-disabled` on its own.
  useEffect(() => {
    if (!undoState) return;
    const remaining = Math.max(0, undoState.expiresAt - Date.now());
    const timer = setTimeout(() => setUndoState(null), remaining);
    return () => clearTimeout(timer);
  }, [undoState]);

  // Drop the 409 highlight after its window.
  useEffect(() => {
    if (conflictIds.size === 0) return;
    const timer = setTimeout(() => setConflictIds(new Set()), CONFLICT_FLAG_MS);
    return () => clearTimeout(timer);
  }, [conflictIds]);

  const settle = useCallback(() => {
    inFlightRef.current = false;
    endReorder();
    setPendingTree(null);
  }, []);

  const handleError = useCallback(
    (
      error: unknown,
      movingId: string,
      before: TreeItem[],
      attempted: TreeItem[],
    ) => {
      const api = error as ApiErrorLike;
      const status = api.response?.status;
      const code = api.response?.data?.error;
      const moved = before.find((i) => i.id === movingId);
      const name = moved?.label ?? "";

      // 409 — another admin changed the tree first. Resynchronise, put the
      // operator back on their node, and show them what moved underneath them.
      if (status === 409 || code === "CATEGORY_TREE_STALE") {
        announceAssertive(rejected.CATEGORY_TREE_STALE);
        toast.error(rejected.CATEGORY_TREE_STALE);
        // `fetchQuery`, not `refetchQueries`: the latter only touches queries
        // that already have an observer, so it silently no-ops if the tree is
        // read anywhere other than a currently-mounted component. `fetchQuery`
        // resolves with the fresh tree AND writes it into the cache, which is
        // what every mounted observer re-renders from.
        void queryClient
          .fetchQuery(getCategoryControllerGetAdminTreeQueryOptions())
          .then((fresh: AdminCategoryTreeResponse) => {
            const freshItems = flattenAdminCategoryTree(fresh?.data);
            setConflictIds(changedRowIds(before, freshItems));
            onFocusRow?.(movingId);
            const at = describe(freshItems, movingId);
            if (at) {
              announcePolite(
                a.positionAfterConflict(
                  at.name,
                  at.pos,
                  at.size,
                  at.level,
                  at.parent,
                ),
              );
            }
          })
          .catch(() => {
            /* the assertive conflict alert already fired — nothing to add */
          });
        return;
      }

      const message = ((): string => {
        switch (code) {
          case "CATEGORY_CYCLE": {
            // The target name is the parent the operator AIMED at — we resolve
            // it from the attempted tree, because the server deliberately sends
            // no ids on the wire (§3.5: the admin initiated the move, so the
            // client already knows both ends).
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
            // A code we do not recognise. NEVER announce a raw backend string
            // and NEVER leave the region empty.
            return dict.reorderTree.rejectedUnknown(name);
        }
      })();

      announceAssertive(message);
      toast.error(message);
      onFocusRow?.(movingId);
    },
    [announceAssertive, announcePolite, onFocusRow, queryClient],
  );

  const move = useCallback(
    (next: TreeItem[], movingId: string, options?: MoveOptions) => {
      if (inFlightRef.current) {
        announcePolite(a.busyRefused);
        return;
      }
      const prev = effective;
      const groups = toReorderGroups(prev, next);
      if (groups.length === 0) return; // nothing actually changed — no request

      inFlightRef.current = true;
      beginReorder();
      setPendingTree(next);
      announcePolite(a.saving);

      reorder.mutate(
        { data: { groups } },
        {
          onSuccess: (response) => {
            queryClient.setQueryData(TREE_KEY, response);
            setUndoState({
              // The exact inverse: the buckets that changed, back to `prev`.
              groups: toReorderGroups(next, prev),
              movingId,
              expiresAt: Date.now() + UNDO_WINDOW_MS,
            });
            const from = describe(prev, movingId);
            const to = describe(next, movingId);
            if (from && to) {
              announcePolite(
                a.committed(
                  to.name,
                  to.pos,
                  to.size,
                  to.parentLabel,
                  from.pos,
                  from.size,
                  from.parentLabel,
                ),
              );
            }
            if (options?.focusOnSuccess) onFocusRow?.(movingId);
          },
          onError: (error) => handleError(error, movingId, prev, next),
          onSettled: settle,
        },
      );
    },
    [
      announcePolite,
      effective,
      handleError,
      onFocusRow,
      queryClient,
      reorder,
      settle,
    ],
  );

  const undo = useCallback(() => {
    if (inFlightRef.current || !undoState) return;
    if (undoState.expiresAt <= Date.now()) {
      setUndoState(null);
      return;
    }
    const { groups, movingId } = undoState;

    inFlightRef.current = true;
    beginReorder();
    announcePolite(a.saving);

    reorder.mutate(
      { data: { groups } },
      {
        onSuccess: (response) => {
          queryClient.setQueryData(TREE_KEY, response);
          setUndoState(null);
          announcePolite(a.undone);
          onFocusRow?.(movingId);
        },
        onError: (error) => handleError(error, movingId, effective, effective),
        onSettled: settle,
      },
    );
  }, [
    announcePolite,
    effective,
    handleError,
    onFocusRow,
    queryClient,
    reorder,
    settle,
    undoState,
  ]);

  return useMemo<CategoryTreeReorderApi>(
    () => ({
      items: effective,
      isPending: reorder.isPending,
      canUndo: undoState !== null && !reorder.isPending,
      conflictIds,
      move,
      undo,
    }),
    [conflictIds, effective, move, reorder.isPending, undo, undoState],
  );
}
