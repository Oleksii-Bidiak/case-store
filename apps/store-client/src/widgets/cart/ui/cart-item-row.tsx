"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, ShieldCheck, Trash2 } from "lucide-react";
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
import { addonServicesForItem } from "../model/addon-services";
import { resolveQuantityCommit } from "../model/quantity-commit";

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

interface CartItemRowProps {
  item: CartItemEntity;
  /** Whether an add-on service (stub) is selected for this line. */
  isServiceSelected?: (itemId: string, serviceId: string) => boolean;
  /** Toggle a stub add-on service; when omitted the offers block is hidden. */
  onToggleService?: (itemId: string, serviceId: string) => void;
  /**
   * Called when the user clicks through to the product page. The mini-cart
   * sheet passes its `close` here — without it the sheet stays open over the
   * navigated page, which reads as "nothing happened, the image just flickered"
   * (TASK-204), especially when the target PDP is the page already underneath.
   */
  onNavigate?: () => void;
}

/**
 * CartItemRow — a single cart line item with a quantity stepper and remove
 * control. Quantity changes update the React Query cache optimistically (so the
 * line total and cart summary recalculate instantly) and write to the server on
 * a debounce; the server remains authoritative and reconciles on refetch.
 *
 * The "додаткові пропозиції" offers block is a front-end stub (TASK-174) — it
 * renders only when the CartView passes `onToggleService`.
 */
export function CartItemRow({
  item,
  isServiceSelected,
  onToggleService,
  onNavigate,
}: CartItemRowProps) {
  const queryClient = useQueryClient();
  // `""` while the user has manually cleared the field — rendering it as-is
  // keeps the input visually empty instead of snapping to «0» (TASK-207).
  const [qty, setQty] = useState<number | "">(item.quantity);
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
  const lineOldText =
    onSale && compareAtPrice
      ? formatMoney(centsToString(toCents(compareAtPrice) * item.quantity))
      : null;

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

  /** Commit a stepper quantity: 0 removes the item, otherwise update. */
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

  /**
   * Commit the typed input on blur. Unlike the stepper's `commit`, an empty /
   * zero / invalid value restores the previous quantity instead of removing
   * the line — removal stays an explicit action via the trash button
   * (TASK-207). The decision table lives in `resolveQuantityCommit`.
   */
  const commitTyped = () => {
    const result = resolveQuantityCommit(qty, item.quantity, maxQty);
    if (result.kind === "restore" || result.kind === "noop") {
      setQty(item.quantity);
      return;
    }
    setQty(result.quantity);
    applyOptimisticQuantity(result.quantity);
    debouncedUpdate(result.quantity);
  };

  // The stepper buttons need a numeric base even while the field is cleared;
  // fall back to the cart's authoritative quantity in that transient state.
  const stepperQty = qty === "" ? item.quantity : qty;

  const offers = onToggleService ? addonServicesForItem(item) : [];

  // Single source for the PDP link — the image and the product name must always
  // point at the same place (TASK-204).
  const productHref = `/products/${item.productSlug}`;

  return (
    <li
      className={`flex gap-[18px] border-b border-border p-[22px] last:border-b-0 ${
        removeItem.isPending ? "pointer-events-none opacity-60" : ""
      }`}
    >
      <Link
        href={productHref}
        onClick={onNavigate}
        aria-label={dict.cart.viewProductAria(item.productName)}
        className="shrink-0 rounded-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {item.imageUrl && !imgFailed ? (
          <Image
            src={item.imageUrl}
            alt={item.productName}
            width={96}
            height={96}
            onError={() => setImgFailed(true)}
            className="size-24 rounded-[13px] object-cover"
          />
        ) : (
          <ProductThumb
            name={item.productName}
            className="size-24 rounded-[13px]"
            initialClassName="text-3xl"
          />
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex justify-between gap-3.5">
          <div className="min-w-0">
            <p className="mb-1 text-[15px] font-semibold text-foreground">
              <Link
                href={productHref}
                onClick={onNavigate}
                className="rounded-sm transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.productName}
              </Link>
            </p>
            <p
              className={`flex items-center gap-1.5 text-[12.5px] ${
                outOfStock ? "text-muted-foreground" : "text-success"
              }`}
            >
              <span
                aria-hidden="true"
                className={`size-1.5 rounded-full ${
                  outOfStock ? "bg-muted-foreground" : "bg-success"
                }`}
              />
              {outOfStock ? dict.cart.outOfStock : dict.cart.inStock}
            </p>
          </div>
          <button
            type="button"
            aria-label={dict.cart.removeNamedAria(item.productName)}
            onClick={() => removeItem.mutate({ itemId: item.id })}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="size-[18px]" />
          </button>
        </div>

        <div className="mt-auto flex flex-wrap items-end justify-between gap-3.5 pt-3">
          <div className="flex items-center overflow-hidden rounded-[10px] border border-border">
            <button
              type="button"
              aria-label={dict.cart.decreaseAria}
              disabled={stepperQty <= 1}
              onClick={() => commit(Math.max(1, stepperQty - 1))}
              className="flex size-9 items-center justify-center bg-background text-lg text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
            >
              −
            </button>
            <input
              type="number"
              aria-label={dict.cart.quantityAria}
              min={1}
              max={maxQty}
              value={qty}
              onChange={(e) =>
                setQty(e.target.value === "" ? "" : Number(e.target.value))
              }
              onBlur={commitTyped}
              className="w-11 bg-background py-1.5 text-center font-mono text-[15px] font-semibold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <button
              type="button"
              aria-label={dict.cart.increaseAria}
              disabled={stepperQty >= maxQty || outOfStock}
              onClick={() => commit(stepperQty + 1)}
              className="flex size-9 items-center justify-center bg-background text-lg text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
            >
              +
            </button>
          </div>

          <div className="text-right">
            {lineOldText && (
              <span className="block text-[12.5px] text-muted-foreground line-through">
                {lineOldText}
              </span>
            )}
            <span className="font-display text-[19px] font-bold text-foreground">
              {formatMoney(item.lineTotal)}
            </span>
          </div>
        </div>

        {offers.length > 0 && (
          <div className="mt-4 border-t border-dashed border-border pt-3">
            <p className="mb-1 flex items-center gap-1.5 text-[12.5px] font-bold text-primary">
              <ShieldCheck className="size-[15px]" aria-hidden="true" />
              {dict.cart.offersHeading}
            </p>
            {offers.map((service) => {
              const on = isServiceSelected?.(item.id, service.id) ?? false;
              return (
                <label
                  key={service.id}
                  className="flex cursor-pointer items-center gap-2.5 border-t border-border py-[9px]"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onToggleService?.(item.id, service.id)}
                    className="sr-only"
                  />
                  <span
                    className={`flex size-5 shrink-0 items-center justify-center rounded-[6px] border-[1.5px] transition-colors ${
                      on ? "border-primary bg-primary" : "border-border"
                    }`}
                  >
                    {on && (
                      <Check
                        className="size-3 text-primary-foreground"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 text-[13.5px] text-foreground">
                    {service.label}
                  </span>
                  <b className="font-mono text-[13.5px] font-bold whitespace-nowrap text-foreground">
                    +{formatMoney(String(service.price))}
                  </b>
                </label>
              );
            })}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {dict.cart.updateError}
          </p>
        )}
      </div>
    </li>
  );
}
