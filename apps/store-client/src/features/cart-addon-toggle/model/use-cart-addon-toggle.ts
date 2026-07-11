"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCartQueryKey,
  useDeselectCartItemAddon,
  useSelectCartItemAddon,
  type CartItemEntity,
  type GetCart200,
} from "@/entities/cart";

/** Price string ("XX.YY") to integer cents — mirrors the backend arithmetic. */
function toCents(price: string): number {
  return Math.round(parseFloat(price) * 100);
}

/** Integer cents back to a "XX.YY" string — mirrors the backend formatting. */
function centsToString(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `${dollars}.${remainder.toString().padStart(2, "0")}`;
}

/**
 * Recompute `totals.addonsTotal` exactly the way the server does (TASK-174):
 * the EFFECTIVE price of every selected add-on, summed once per line — flat,
 * never multiplied by the line quantity — in integer cents.
 */
function recomputeAddonsTotal(items: CartItemEntity[]): string {
  let cents = 0;
  for (const line of items) {
    const selected = new Set(line.selectedAddonIds);
    for (const addon of line.availableAddons) {
      if (selected.has(addon.addonServiceId)) cents += toCents(addon.price);
    }
  }
  return centsToString(cents);
}

/**
 * Select / deselect an add-on service on a cart line (TASK-174).
 *
 * The checkbox must feel instant, so the cached cart is patched optimistically —
 * the toggled id is added to / removed from that line's `selectedAddonIds` and
 * `totals.addonsTotal` is recomputed with the same cents arithmetic the backend
 * uses. The server stays authoritative: both success and error invalidate
 * `getGetCartQueryKey()`, so a rejected selection (the add-on stopped applying)
 * rolls straight back to server truth on the refetch.
 */
export function useCartAddonToggle() {
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });

  const select = useSelectCartItemAddon({
    mutation: { onSuccess: invalidate, onError: invalidate },
  });
  const deselect = useDeselectCartItemAddon({
    mutation: { onSuccess: invalidate, onError: invalidate },
  });

  const applyOptimistic = (
    itemId: string,
    addonServiceId: string,
    selected: boolean,
  ) => {
    queryClient.setQueryData<GetCart200>(getGetCartQueryKey(), (prev) => {
      if (!prev?.data) return prev;

      const items = prev.data.items.map((line) =>
        line.id === itemId
          ? {
              ...line,
              selectedAddonIds: selected
                ? [...new Set([...line.selectedAddonIds, addonServiceId])]
                : line.selectedAddonIds.filter((id) => id !== addonServiceId),
            }
          : line,
      );

      return {
        ...prev,
        data: {
          ...prev.data,
          items,
          totals: {
            ...prev.data.totals,
            addonsTotal: recomputeAddonsTotal(items),
          },
        },
      };
    });
  };

  const toggle = (
    itemId: string,
    addonServiceId: string,
    selected: boolean,
  ) => {
    applyOptimistic(itemId, addonServiceId, selected);

    if (selected) {
      select.mutate({ itemId, addonServiceId });
    } else {
      deselect.mutate({ itemId, addonServiceId });
    }
  };

  return {
    toggle,
    isPending: select.isPending || deselect.isPending,
    error: select.error ?? deselect.error,
  };
}
