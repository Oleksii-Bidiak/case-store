"use client";

/**
 * The flat lists' reorder lifecycle WITH the «Скасувати» toast (wave 198,
 * TASK-963 — owner: «тост «Скасувати» після перетягування замість тьмяної
 * кнопки»). The content adapters (pages, FAQ, blog categories, banners,
 * carousels) call this instead of `useReorderLifecycle`, so every widget gets
 * the toast without passing anything new. It mirrors what
 * `features/category-tree-reorder` does for the tree.
 *
 * - A COMMITTED move (drag or keyboard) posts `toast.undo` naming the row and
 *   its new place. A refused, no-op or rejected move posts nothing, and an
 *   undo is not a move, so it posts nothing either.
 * - The toast's action runs the SAME undo the persistent control runs — the
 *   lifecycle's inverse payload. Using either one retires the toast.
 * - ONE undo toast across all flat lists at a time: banners and carousels
 *   mount one hook per placement, and an older toast would otherwise sit next
 *   to a newer one. A newer move dismisses whatever toast is live.
 * - The persistent control stays: a toast never takes focus and expires, so it
 *   cannot be the keyboard user's way back (`shared/ui/reorder-undo-button.tsx`).
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useReorderLifecycle,
  type ReorderLifecycleApi,
  type ReorderMutationCallbacks,
  type UseReorderLifecycleOptions,
} from "@/shared/lib/list-reorder";
import type { TreeItem } from "@/shared/lib/sortable-tree";
import { dict } from "@/shared/config";
import { toast } from "@/shared/ui/toast";

const m = dict.reorderList.movedToast;

/** What the toast says: the row and its new place, or a neutral line. */
export function flatMovedToastMessage(
  next: TreeItem[],
  movingId: string,
): string {
  const at = next.findIndex((i) => i.id === movingId);
  const name = at === -1 ? "" : next[at].label.trim();
  return name === "" ? m.neutral : m.moved(name, at + 1, next.length);
}

/**
 * The live undo toast, shared by every flat list on the screen. `owner` is
 * the hook instance that posted it, so an instance only ever dismisses its own.
 */
let liveToast: { id: string | number; owner: object } | null = null;

function dismissLiveToast(owner?: object) {
  if (liveToast === null) return;
  if (owner !== undefined && liveToast.owner !== owner) return;
  toast.dismiss(liveToast.id);
  liveToast = null;
}

interface PendingMove {
  next: TreeItem[];
  movingId: string;
}

export function useUndoToastReorder<TPayload, TResponse>(
  options: UseReorderLifecycleOptions<TPayload, TResponse>,
): ReorderLifecycleApi {
  const { mutate: adapterMutate } = options;

  /** This instance's identity for `liveToast.owner` (stable for its lifetime). */
  const ownerRef = useRef<object>({});

  /**
   * The move the NEXT `mutate` call belongs to. Set by the wrapped `move` just
   * before handing over and claimed synchronously by `mutate` — the lifecycle
   * calls `mutate` inside `move` or not at all — so a refused or no-op move
   * leaves nothing behind, and an undo's `mutate` finds it empty (no toast).
   */
  const pendingMoveRef = useRef<PendingMove | null>(null);
  /** The toast's action calls the CURRENT undo, not the one of its render. */
  const undoRef = useRef<() => void>(() => undefined);

  const mutate = useCallback(
    (payload: TPayload, callbacks: ReorderMutationCallbacks<TResponse>) => {
      const moved = pendingMoveRef.current;
      pendingMoveRef.current = null;
      adapterMutate(payload, {
        ...callbacks,
        onSuccess: (response) => {
          callbacks.onSuccess(response);
          if (!moved) return;
          // One undo on offer at a time: the older toast would now undo
          // something other than what its words say.
          dismissLiveToast();
          liveToast = {
            id: toast.undo(flatMovedToastMessage(moved.next, moved.movingId), {
              onUndo: () => undoRef.current(),
            }),
            owner: ownerRef.current,
          };
        },
      });
    },
    [adapterMutate],
  );

  const lifecycle = useReorderLifecycle<TPayload, TResponse>({
    ...options,
    mutate,
  });
  const { move: lifecycleMove, undo: lifecycleUndo } = lifecycle;

  const move = useCallback<ReorderLifecycleApi["move"]>(
    (next, movingId, moveOptions) => {
      pendingMoveRef.current = { next, movingId };
      lifecycleMove(next, movingId, moveOptions);
      pendingMoveRef.current = null;
    },
    [lifecycleMove],
  );

  // The persistent control and the toast offer the SAME undo; whichever the
  // operator uses, the other must not keep offering it.
  const undo = useCallback(() => {
    dismissLiveToast(ownerRef.current);
    lifecycleUndo();
  }, [lifecycleUndo]);

  useEffect(() => {
    undoRef.current = undo;
  }, [undo]);

  // A toast that outlives its list would undo into an unmounted grid.
  useEffect(() => {
    const owner = ownerRef.current;
    return () => dismissLiveToast(owner);
  }, []);

  return useMemo<ReorderLifecycleApi>(
    () => ({ ...lifecycle, move, undo }),
    [lifecycle, move, undo],
  );
}
