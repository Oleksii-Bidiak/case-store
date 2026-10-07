"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getGetCartQueryKey, removeCartItem } from "@/entities/cart";
import { dict } from "@/shared/config";

/** What one «Прибрати недоступні» run achieved. */
export interface RemoveUnavailableResult {
  removed: number;
  failed: number;
  /**
   * The cart was re-read after the removals. When that refetch fails the
   * cache keeps the old cart, so whatever waits for the cleaned cart (the
   * focus hand-off) must stand down — or it fires later, on some other change.
   */
  refreshed: boolean;
}

interface UseRemoveUnavailableItemsOptions {
  /**
   * Route the result toast to a `<Toaster id>` mounted inside a modal host —
   * the mini-cart sheet passes `CART_SHEET_TOASTER_ID` (TASK-497). Omitted on
   * the `/cart` page, where the global toaster is reachable.
   */
  toasterId?: string;
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | undefined)?.response
    ?.status;
}

/**
 * Remove every withdrawn line from the cart in one action (TASK-657).
 *
 * Deliberately NOT N row mutations: each `CartItemRow` removal invalidates the
 * cart and raises its own undo toast, so clearing three lines that way would
 * mean three refetches and three «Повернути» offers. Here the raw DELETE runs
 * sequentially (the cart is one row server-side — parallel deletes would race
 * on it), then the cart is refetched ONCE and ONE toast reports the result.
 * There is no undo: the lines are withdrawn from sale, re-adding them would
 * only block checkout again.
 *
 * A 404 counts as removed — the line is already gone (another tab, an expired
 * guest cart), which is exactly what the shopper asked for. Any other failure
 * is counted and reported in an error toast; the remaining lines stay, the
 * button stays, and a second click retries just those.
 */
export function useRemoveUnavailableItems({
  toasterId,
}: UseRemoveUnavailableItemsOptions = {}) {
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  // A second click while the loop runs must not start a second loop over the
  // same ids — state alone is one render too late to stop a double click.
  const runningRef = useRef(false);

  const removeAll = async (
    itemIds: readonly string[],
  ): Promise<RemoveUnavailableResult> => {
    if (runningRef.current || itemIds.length === 0) {
      return { removed: 0, failed: 0, refreshed: false };
    }
    runningRef.current = true;
    setIsPending(true);

    let removed = 0;
    let failed = 0;
    let refreshed = false;
    try {
      for (const itemId of itemIds) {
        try {
          await removeCartItem(itemId);
          removed += 1;
        } catch (error) {
          if (statusOf(error) === 404) removed += 1;
          else failed += 1;
        }
      }
      // Awaited so the caller resumes with the refreshed cart in the cache.
      // `invalidateQueries` swallows a failed refetch — the state tells.
      await queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
      refreshed =
        queryClient.getQueryState(getGetCartQueryKey())?.status !== "error";
    } finally {
      runningRef.current = false;
      setIsPending(false);
    }

    const options = toasterId ? { toasterId } : undefined;
    if (failed > 0) {
      toast.error(dict.cart.removeUnavailableError(failed), options);
    } else {
      toast.success(dict.cart.removeUnavailableDone(removed), options);
    }
    return { removed, failed, refreshed };
  };

  return { removeAll, isPending };
}
