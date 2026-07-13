"use client";

/**
 * THE reorder mutation lifecycle (plan 158 §3.11 / §5 / §7.3 / §7.5; extracted
 * out of `use-category-tree-reorder.ts` for TASK-295).
 *
 * One implementation now serves the category TREE and the three FLAT admin lists
 * (banners, blog categories, device brands). Everything resource-specific — the
 * wire payload, the error-code table, the wording of an announcement — is a
 * parameter; everything that is a RULE is here:
 *
 * 1. SINGLE IN-FLIGHT PATCH. The guard is a ref, not `mutation.isPending`:
 *    `isPending` only flips on the next render, so two synchronous key presses
 *    would both pass an `isPending` check. A refused second move fires NO
 *    request and politely announces the `busyRefused` string.
 * 2. A `pendingItems` OVERRIDE, not `setQueryData` cache surgery. The optimistic
 *    list is component state that SHADOWS the query data while the PATCH is in
 *    flight and is dropped in `onSettled`. Rollback is therefore "stop
 *    overriding" — there is no cache state to restore, and a concurrent
 *    background refetch cannot resurrect a half-applied optimistic write.
 * 3. On success the SERVER-RETURNED list is written into the cache (every reorder
 *    endpoint returns the full refreshed list), so the client resynchronises in
 *    one round trip, and the INVERSE payload is kept for the persistent Undo
 *    control (~30 s window).
 * 4. On error: drop the override, re-focus the moved row, announce the
 *    error-code-keyed string (mirrored to `toast.error`). A CONFLICT (409)
 *    additionally refetches, re-focuses the operator's row, politely announces
 *    its NEW position, and flags every row whose bucket/position changed for ~5 s.
 *    The single-in-flight guard spans that recovery fetch — a reflexive retry
 *    issued in the gap would diff against the stale cache and be clobbered by the
 *    late recovery write.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  beginReorder,
  endReorder,
  type ReorderResource,
} from "@/shared/lib/reorder-lock";
import type { TreeItem } from "@/shared/lib/sortable-tree";
import { useAnnouncer } from "@/shared/ui/live-announcer";

/** How long the persistent Undo control stays enabled after a commit. */
export const UNDO_WINDOW_MS = 30_000;
/** How long rows changed by a CONCURRENT admin stay visually flagged after a conflict. */
export const CONFLICT_FLAG_MS = 5_000;

const ROOT = "__root__";

/** The shape the backend error envelope reaches us in (`HttpExceptionFilter`). */
interface ApiErrorLike {
  response?: { status?: number; data?: { error?: string } };
}

/** Ids whose bucket OR position within it differs between two lists. */
export function changedRowIds(
  before: TreeItem[],
  after: TreeItem[],
): Set<string> {
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

export interface ReorderMoveOptions {
  /**
   * Focus the moved row on success. The keyboard path leaves this off (focus is
   * already on the row); a menu item or a dialog sets it, because §7.5 requires
   * focus to land on the MOVED ROW, not on a trigger that may have re-rendered
   * away.
   */
  focusOnSuccess?: boolean;
}

export interface ReorderLifecycleApi {
  /** What the UI must render: the optimistic override while saving, else the server list. */
  items: TreeItem[];
  /** A PATCH is in flight — drives `aria-busy` on the grid. */
  isPending: boolean;
  /** The persistent Undo control is live (a commit happened < 30 s ago and nothing is saving). */
  canUndo: boolean;
  /** Rows another admin moved under us (409) — flagged for ~5 s. */
  conflictIds: ReadonlySet<string>;
  /** Commit a move. `next` is the FULL list in its new order. */
  move: (
    next: TreeItem[],
    movingId: string,
    options?: ReorderMoveOptions,
  ) => void;
  /** Replay the exact inverse payload of the last commit. */
  undo: () => void;
}

/** The mutation callbacks the adapter must forward to its Orval hook. */
export interface ReorderMutationCallbacks<TResponse> {
  onSuccess: (response: TResponse) => void;
  onError: (error: unknown) => void;
  onSettled: () => void;
}

/**
 * Every string the lifecycle can speak. Resource-specific wording (and, for the
 * tree, the level/parent detail) is resolved by the adapter — the lifecycle never
 * builds a sentence itself and never announces a raw backend message.
 */
export interface ReorderLifecycleStrings {
  /** Polite, on pick-up-to-commit. */
  saving: string;
  /** Polite, when a second move is refused while one is in flight. */
  busyRefused: string;
  /** Polite, after a successful undo. */
  undone: string;
  /** Assertive, on the staleness conflict (409). */
  conflict: string;
  /** Assertive: map a NON-conflict rejection onto its message. */
  rejected: (context: {
    /** The backend's stable error code, if the envelope carried one. */
    code: string | undefined;
    movingId: string;
    /** The list as it was before the rejected request. */
    before: TreeItem[];
    /** The list the rejected request was trying to produce. */
    attempted: TreeItem[];
  }) => string;
  /** Polite, after a commit. `null` ⇒ say nothing. */
  committed: (
    prev: TreeItem[],
    next: TreeItem[],
    movingId: string,
  ) => string | null;
  /** Polite, after the conflict-recovery refetch lands. `null` ⇒ say nothing. */
  positionAfterConflict: (fresh: TreeItem[], movingId: string) => string | null;
}

export interface UseReorderLifecycleOptions<TPayload, TResponse> {
  /** Keys the reorder lock (see `shared/lib/reorder-lock`). */
  resource: ReorderResource;
  /** The SERVER list this hook orders (what the query holds). */
  items: TreeItem[];
  /**
   * The wire payload that turns `from` into `to`. `null` ⇒ nothing actually
   * changed, so no request is sent. Called BOTH ways: `(prev, next)` for a move
   * and `(next, prev)` for its undo — which is what makes the undo exact.
   */
  toPayload: (from: TreeItem[], to: TreeItem[]) => TPayload | null;
  /** Forwards to the Orval mutation. */
  mutate: (
    payload: TPayload,
    callbacks: ReorderMutationCallbacks<TResponse>,
  ) => void;
  /** The mutation's `isPending` — drives `aria-busy` and the Undo control. */
  isPending: boolean;
  /** Where the server response is written verbatim. */
  queryKey: QueryKey;
  /**
   * Conflict recovery: refetch authoritatively (writing the cache) and resolve
   * with the fresh items OF THIS LIST — a banner section resolves only its own
   * placement bucket.
   */
  refetch: () => Promise<TreeItem[]>;
  strings: ReorderLifecycleStrings;
  /** Focus a row by id — owned by the widget that renders the grid. */
  onFocusRow?: (id: string) => void;
  /**
   * Is this error the staleness conflict? Defaults to "HTTP 409". The tree also
   * accepts its own `CATEGORY_TREE_STALE` code.
   */
  isConflict?: (
    status: number | undefined,
    code: string | undefined,
  ) => boolean;
}

interface UndoState<TPayload> {
  payload: TPayload;
  movingId: string;
  expiresAt: number;
  /**
   * The list as it was BEFORE the move this undo reverses — i.e. the list the
   * undo is trying to restore. It is the `attempted` list of the undo request: a
   * rejection must name what the undo AIMED at, not where the original move left
   * the row.
   */
  prevItems: TreeItem[];
}

export function useReorderLifecycle<TPayload, TResponse>({
  resource,
  items,
  toPayload,
  mutate,
  isPending,
  queryKey,
  refetch,
  strings,
  onFocusRow,
  isConflict = (status) => status === 409,
}: UseReorderLifecycleOptions<TPayload, TResponse>): ReorderLifecycleApi {
  const queryClient = useQueryClient();
  const { announcePolite, announceAssertive } = useAnnouncer();

  const [pendingItems, setPendingItems] = useState<TreeItem[] | null>(null);
  const [undoState, setUndoState] = useState<UndoState<TPayload> | null>(null);
  const [conflictIds, setConflictIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  /**
   * SYNCHRONOUS single-in-flight guard. `isPending` is derived state and only
   * becomes true on the next render — a second key press inside the same tick
   * would sail straight past it and fire a second PATCH.
   */
  const inFlightRef = useRef(false);

  /**
   * The conflict-recovery GET is ALSO a single-in-flight window: `onSettled`
   * releases `inFlightRef` as soon as the rejected PATCH settles, but the
   * recovery fetch it kicked off is still running and WILL write its list into
   * the cache when it lands. The guard therefore spans the recovery too.
   */
  const recoveringRef = useRef(false);

  /** What the UI renders: the optimistic override while saving, else the server list. */
  const effective = pendingItems ?? items;

  // Expire the Undo window so the control goes `aria-disabled` on its own.
  useEffect(() => {
    if (!undoState) return;
    const remaining = Math.max(0, undoState.expiresAt - Date.now());
    const timer = setTimeout(() => setUndoState(null), remaining);
    return () => clearTimeout(timer);
  }, [undoState]);

  // Drop the conflict highlight after its window.
  useEffect(() => {
    if (conflictIds.size === 0) return;
    const timer = setTimeout(() => setConflictIds(new Set()), CONFLICT_FLAG_MS);
    return () => clearTimeout(timer);
  }, [conflictIds]);

  const settle = useCallback(() => {
    inFlightRef.current = false;
    endReorder(resource);
    setPendingItems(null);
  }, [resource]);

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

      // Another admin changed the list first. Resynchronise, put the operator
      // back on their row, and show them what moved underneath them.
      if (isConflict(status, code)) {
        announceAssertive(strings.conflict);
        toast.error(strings.conflict);
        // Hold the single-in-flight guard (and the sibling-invalidation lock)
        // for the FULL recovery window — see `recoveringRef`.
        recoveringRef.current = true;
        beginReorder(resource);
        void refetch()
          .then((fresh) => {
            setConflictIds(changedRowIds(before, fresh));
            onFocusRow?.(movingId);
            const message = strings.positionAfterConflict(fresh, movingId);
            if (message) announcePolite(message);
          })
          .catch(() => {
            /* the assertive conflict alert already fired — nothing to add */
          })
          .finally(() => {
            recoveringRef.current = false;
            endReorder(resource);
          });
        return;
      }

      const message = strings.rejected({ code, movingId, before, attempted });
      announceAssertive(message);
      toast.error(message);
      onFocusRow?.(movingId);
    },
    [
      announceAssertive,
      announcePolite,
      isConflict,
      onFocusRow,
      refetch,
      resource,
      strings,
    ],
  );

  const move = useCallback(
    (next: TreeItem[], movingId: string, options?: ReorderMoveOptions) => {
      if (inFlightRef.current || recoveringRef.current) {
        announcePolite(strings.busyRefused);
        return;
      }
      const prev = effective;
      const payload = toPayload(prev, next);
      if (payload === null) return; // nothing actually changed — no request

      inFlightRef.current = true;
      beginReorder(resource);
      setPendingItems(next);
      announcePolite(strings.saving);

      mutate(payload, {
        onSuccess: (response) => {
          queryClient.setQueryData(queryKey, response);
          const inverse = toPayload(next, prev);
          setUndoState(
            inverse === null
              ? null
              : {
                  payload: inverse,
                  movingId,
                  expiresAt: Date.now() + UNDO_WINDOW_MS,
                  prevItems: prev,
                },
          );
          const message = strings.committed(prev, next, movingId);
          if (message) announcePolite(message);
          if (options?.focusOnSuccess) onFocusRow?.(movingId);
        },
        onError: (error) => handleError(error, movingId, prev, next),
        onSettled: settle,
      });
    },
    [
      announcePolite,
      effective,
      handleError,
      mutate,
      onFocusRow,
      queryClient,
      queryKey,
      resource,
      settle,
      strings,
      toPayload,
    ],
  );

  const undo = useCallback(() => {
    if (inFlightRef.current || recoveringRef.current || !undoState) return;
    if (undoState.expiresAt <= Date.now()) {
      setUndoState(null);
      return;
    }
    const { payload, movingId, prevItems } = undoState;

    inFlightRef.current = true;
    beginReorder(resource);
    announcePolite(strings.saving);

    mutate(payload, {
      onSuccess: (response) => {
        queryClient.setQueryData(queryKey, response);
        setUndoState(null);
        announcePolite(strings.undone);
        onFocusRow?.(movingId);
      },
      // `attempted` is the list the undo RESTORES (`prevItems`), never the
      // current one: a rejection must name what the undo aimed at, not where the
      // original move left the row.
      onError: (error) => handleError(error, movingId, effective, prevItems),
      onSettled: settle,
    });
  }, [
    announcePolite,
    effective,
    handleError,
    mutate,
    onFocusRow,
    queryClient,
    queryKey,
    resource,
    settle,
    strings,
    undoState,
  ]);

  return useMemo<ReorderLifecycleApi>(
    () => ({
      items: effective,
      isPending,
      canUndo: undoState !== null && !isPending,
      conflictIds,
      move,
      undo,
    }),
    [conflictIds, effective, isPending, move, undo, undoState],
  );
}
