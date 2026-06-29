"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCartQueryKey,
  useRemoveCartItem,
  useUpdateCartItem,
  type CartItemEntity,
  type GetCart200,
} from "@/entities/cart";
import { formatMoney } from "@/shared/lib";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import { dict } from "@/shared/config";
import { ProductThumb } from "@/shared/ui";

const MAX_QUANTITY = 99;

/** Coerce a loosely-typed generated string field to a usable string. */
function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

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
 * CartItemRow — a single cart line item with a quantity stepper and remove
 * control. Quantity changes update the React Query cache optimistically (so the
 * line total and cart summary recalculate instantly) and write to the server on
 * a debounce; the server remains authoritative and reconciles on refetch.
 */
export function CartItemRow({ item }: { item: CartItemEntity }) {
  const queryClient = useQueryClient();
  const [qty, setQty] = useState(item.quantity);
  const [imgFailed, setImgFailed] = useState(false);

  // Re-sync the local input whenever the cart's authoritative quantity changes
  // (after an optimistic cache write or a server refetch). `useState` seeds only
  // on mount, so without this the counter would lag behind. Adjusting state
  // during render is React's recommended pattern for derived-from-prop resets.
  const [syncedQuantity, setSyncedQuantity] = useState(item.quantity);
  if (item.quantity !== syncedQuantity) {
    setSyncedQuantity(item.quantity);
    setQty(item.quantity);
  }

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });

  const updateItem = useUpdateCartItem({
    // On success the optimistic cache already matches; refetch to reconcile.
    // On error, refetch to roll back the optimistic change to server truth.
    mutation: { onSuccess: invalidate, onError: invalidate },
  });
  const removeItem = useRemoveCartItem({
    mutation: { onSuccess: invalidate, onError: invalidate },
  });

  const error = updateItem.error || removeItem.error;

  // Each line is a product position with its own stock; cap the stepper at the
  // available stock (or the global max, whichever is lower).
  const maxQty = Math.min(MAX_QUANTITY, item.stock);
  const outOfStock = item.stock <= 0;

  const compareAtPrice = asString(item.compareAtPrice);
  const onSale =
    compareAtPrice != null && Number(compareAtPrice) > Number(item.price);

  /**
   * Optimistically patch the cached cart so the row's line total and the cart
   * summary (subtotal / item count) reflect the new quantity immediately,
   * before the debounced server write completes. Totals are recomputed the same
   * way the backend does (cents arithmetic, no discounts in MVP).
   */
  const applyOptimisticQuantity = (quantity: number) => {
    queryClient.setQueryData<GetCart200>(getGetCartQueryKey(), (prev) => {
      if (!prev?.data) return prev;
      const items = prev.data.items.map((line) =>
        line.id === item.id
          ? {
              ...line,
              quantity,
              lineTotal: centsToString(toCents(line.price) * quantity),
            }
          : line,
      );
      let subtotalCents = 0;
      let itemCount = 0;
      for (const line of items) {
        subtotalCents += toCents(line.price) * line.quantity;
        itemCount += line.quantity;
      }
      return {
        ...prev,
        data: {
          ...prev.data,
          items,
          totals: {
            ...prev.data.totals,
            subtotal: centsToString(subtotalCents),
            itemCount,
            uniqueItems: items.length,
          },
        },
      };
    });
  };

  // Debounce server writes so rapid +/- tapping dispatches a single PATCH for
  // the final quantity rather than one request per click.
  const debouncedUpdate = useDebouncedCallback((quantity: number) => {
    updateItem.mutate({ itemId: item.id, data: { quantity } });
  }, 300);

  /** Commit a desired quantity: 0 removes the item, otherwise update. */
  const commit = (next: number) => {
    const clamped = Math.max(0, Math.min(maxQty, next));
    if (clamped <= 0) {
      removeItem.mutate({ itemId: item.id });
      return;
    }
    // Compare against the cart's actual quantity (not the local input, which the
    // user may have already typed into) so manual entry still triggers a write.
    if (clamped === item.quantity) {
      setQty(item.quantity);
      return;
    }
    setQty(clamped);
    applyOptimisticQuantity(clamped);
    debouncedUpdate(clamped);
  };

  return (
    <li
      className={`flex flex-col gap-3 border-b border-border py-4 ${
        removeItem.isPending ? "pointer-events-none opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <Link
          href={`/products/${item.productSlug}`}
          aria-label={dict.cart.viewProductAria(item.productName)}
          className="flex items-start gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {item.imageUrl && !imgFailed ? (
            // next/image optimization + remote-host config deferred to TASK-042.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt={item.productName}
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="size-16 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <ProductThumb
              name={item.productName}
              className="size-16 shrink-0 rounded-lg"
              initialClassName="text-xl"
            />
          )}
          <div className="flex flex-col">
            <p className="font-medium text-foreground">{item.productName}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-sm text-foreground">
                {formatMoney(item.price)}
              </span>
              {onSale && compareAtPrice && (
                <span className="text-xs text-muted-foreground line-through">
                  {formatMoney(compareAtPrice)}
                </span>
              )}
            </div>
          </div>
        </Link>
        <p className="shrink-0 font-semibold text-foreground">
          {formatMoney(item.lineTotal)}
        </p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center rounded-lg border border-border">
          <button
            type="button"
            aria-label={
              qty <= 1 ? dict.cart.removeItemAria : dict.cart.decreaseAria
            }
            onClick={() =>
              qty <= 1
                ? removeItem.mutate({ itemId: item.id })
                : commit(qty - 1)
            }
            className="px-3 py-1.5 text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            −
          </button>
          <input
            type="number"
            aria-label={dict.cart.quantityAria}
            min={1}
            max={maxQty}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            onBlur={() => commit(qty)}
            className="w-12 border-x border-border bg-background py-1.5 text-center text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="button"
            aria-label={dict.cart.increaseAria}
            disabled={qty >= maxQty || outOfStock}
            onClick={() => commit(qty + 1)}
            className="px-3 py-1.5 text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          >
            +
          </button>
        </div>

        <button
          type="button"
          aria-label={dict.cart.removeNamedAria(item.productName)}
          onClick={() => removeItem.mutate({ itemId: item.id })}
          className="text-sm text-destructive hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {dict.cart.remove}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {dict.cart.updateError}
        </p>
      )}
    </li>
  );
}
