"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getGetWishlistQueryKey,
  useAddToWishlist,
  useRemoveFromWishlist,
  type GetWishlist200,
  type WishlistItemEntity,
} from "@/entities/wishlist";
import { dict } from "@/shared/config";

/** How long «Повернути» stays on screen (Д3-2 Wishlist §18.6). */
export const WISHLIST_UNDO_MS = 6000;

export interface WishlistRemoval {
  /** Remove at once (no confirm) and offer «Повернути» for six seconds. */
  remove: (item: WishlistItemEntity) => void;
  /**
   * Product id → the date it was first saved, for every item brought back by
   * «Повернути» — feed it to `withRestoredDates` so a restored item returns to
   * its place in the list instead of jumping to the top as «just added».
   */
  restoredAt: ReadonlyMap<string, string>;
}

/**
 * Removal with undo on `/wishlist` (TASK-1300, Д3-2 Wishlist §18.6): the
 * heart on a saved card removes the product immediately — no confirm dialog —
 * and a toast «Прибрали «…»» offers «Повернути». A new removal replaces the
 * toast, so only the last one is undoable.
 *
 * Both halves are optimistic on the one cached `useGetWishlist` query, which
 * the header badge and every heart on the page read too: the card leaves (and
 * comes back) at once, then a refetch reconciles with the server. Undo is a
 * re-add — the snapshot is the whole item, so the restored card renders in
 * full before the refetch lands. It waits for the removal's own request
 * first; a re-add that overtook its DELETE would be deleted by it.
 *
 * Runs from the view, not the card: by the time «Повернути» is pressed the
 * card is gone, and React Query fires per-call callbacks only while their
 * observer is mounted — hence `mutateAsync` and the query client.
 */
export function useWishlistRemoval(): WishlistRemoval {
  const queryClient = useQueryClient();
  const { mutateAsync: removeRequest } = useRemoveFromWishlist();
  const { mutateAsync: addRequest } = useAddToWishlist();
  const [restoredAt, setRestoredAt] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  // In-flight DELETEs by product id — undo waits for its own.
  const pendingRemovals = useRef(new Map<string, Promise<unknown>>());
  // Products being brought back — their DELETE must not refetch the list in
  // between (the card would blink out until the re-add lands).
  const restoring = useRef(new Set<string>());
  const toastSeq = useRef(0);
  const lastToastId = useRef<string | null>(null);

  const patchItems = useCallback(
    (update: (items: WishlistItemEntity[]) => WishlistItemEntity[]) => {
      queryClient.setQueryData<GetWishlist200>(
        getGetWishlistQueryKey(),
        (old) => {
          if (!old?.data) return old;
          const items = update(old.data.items);
          return {
            ...old,
            data: { ...old.data, items, itemCount: items.length },
          };
        },
      );
    },
    [queryClient],
  );

  const reconcile = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: getGetWishlistQueryKey() });
  }, [queryClient]);

  const restore = useCallback(
    async (item: WishlistItemEntity) => {
      restoring.current.add(item.productId);
      setRestoredAt((prev) =>
        new Map(prev).set(item.productId, item.createdAt),
      );
      await queryClient.cancelQueries({ queryKey: getGetWishlistQueryKey() });
      patchItems((items) =>
        items.some((other) => other.productId === item.productId)
          ? items
          : [...items, item],
      );
      try {
        await pendingRemovals.current.get(item.productId);
        await addRequest({ data: { productId: item.productId } });
      } catch {
        toast.error(dict.wishlist.undoError);
      } finally {
        restoring.current.delete(item.productId);
        reconcile();
      }
    },
    [addRequest, patchItems, queryClient, reconcile],
  );

  const remove = useCallback(
    (item: WishlistItemEntity) => {
      const queryKey = getGetWishlistQueryKey();
      const previous = queryClient.getQueryData<GetWishlist200>(queryKey);
      void queryClient.cancelQueries({ queryKey });
      patchItems((items) =>
        items.filter((other) => other.productId !== item.productId),
      );

      // One undo at a time: the previous toast goes, a fresh one (with a
      // fresh six seconds) takes its place.
      if (lastToastId.current) toast.dismiss(lastToastId.current);
      toastSeq.current += 1;
      const toastId = `wishlist-undo-${toastSeq.current}`;
      lastToastId.current = toastId;
      toast(dict.wishlist.removedToast(item.productName), {
        id: toastId,
        duration: WISHLIST_UNDO_MS,
        // A Radix modal elsewhere on the page (the filters drawer) parks
        // `pointer-events: none` on <body>; the undo must stay clickable.
        className: "pointer-events-auto",
        action: {
          label: dict.wishlist.undoRemove,
          onClick: () => void restore(item),
        },
      });

      const request = removeRequest({ productId: item.productId });
      pendingRemovals.current.set(
        item.productId,
        request.catch(() => {}),
      );
      request
        .catch(() => {
          // Put the card back and take the undo away — nothing was removed.
          if (previous) {
            queryClient.setQueryData(queryKey, previous);
          }
          toast.dismiss(toastId);
          toast.error(dict.wishlist.error);
        })
        .finally(() => {
          pendingRemovals.current.delete(item.productId);
          if (!restoring.current.has(item.productId)) reconcile();
        });
    },
    [patchItems, queryClient, reconcile, removeRequest, restore],
  );

  return { remove, restoredAt };
}
