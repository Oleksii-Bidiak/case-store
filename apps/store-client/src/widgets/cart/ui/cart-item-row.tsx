"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCartQueryKey,
  useRemoveCartItem,
  useUpdateCartItem,
  type CartItemEntity,
} from "@/entities/cart";
import { formatMoney } from "@/shared/lib";
import { dict } from "@/shared/config";
import { ProductThumb } from "@/shared/ui";

const MAX_QUANTITY = 99;

/** Coerce a loosely-typed generated string field to a usable string. */
function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * CartItemRow — a single cart line item with a quantity stepper and remove
 * control. Mutations refetch the cart on success (server is authoritative for
 * stock clamping and totals).
 */
export function CartItemRow({ item }: { item: CartItemEntity }) {
  const queryClient = useQueryClient();
  const [qty, setQty] = useState(item.quantity);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });

  const revert = () => setQty(item.quantity);

  const updateItem = useUpdateCartItem({
    mutation: { onSuccess: invalidate, onError: revert },
  });
  const removeItem = useRemoveCartItem({
    mutation: { onSuccess: invalidate, onError: revert },
  });

  const isPending = updateItem.isPending || removeItem.isPending;
  const error = updateItem.error || removeItem.error;

  const maxQty =
    item.stock > 0 ? Math.min(MAX_QUANTITY, item.stock) : MAX_QUANTITY;
  const variantName = asString(item.variantName);
  const compareAtPrice = asString(item.compareAtPrice);
  const onSale =
    compareAtPrice != null && Number(compareAtPrice) > Number(item.price);

  /** Commit a desired quantity: 0 removes the item, otherwise update. */
  const commit = (next: number) => {
    const clamped = Math.max(0, Math.min(maxQty, next));
    if (clamped === item.quantity) {
      setQty(item.quantity);
      return;
    }
    if (clamped <= 0) {
      removeItem.mutate({ itemId: item.id });
    } else {
      updateItem.mutate({ itemId: item.id, data: { quantity: clamped } });
    }
  };

  return (
    <li
      className={`flex flex-col gap-3 border-b border-border py-4 ${
        isPending ? "pointer-events-none opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <ProductThumb
            name={item.productName}
            className="size-16 shrink-0 rounded-lg"
            initialClassName="text-xl"
          />
          <div className="flex flex-col">
            <p className="font-medium text-foreground">{item.productName}</p>
            {variantName && (
              <p className="text-sm text-muted-foreground">{variantName}</p>
            )}
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
        </div>
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
            disabled={qty >= maxQty || item.stock === 0}
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
