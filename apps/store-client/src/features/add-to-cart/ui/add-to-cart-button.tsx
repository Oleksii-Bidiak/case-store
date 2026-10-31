"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getGetCartQueryKey, useAddToCart } from "@/entities/cart";
import { Button } from "@/shared/ui";
import { dict, FEATURE_STUBS } from "@/shared/config";
import { trackEvent } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";

/**
 * The out-of-stock CTA (Product / Catalog mockups §3): an OUTLINE button on
 * the card surface — sold out is a fact, not a disabled grey slab.
 *
 * «Повідомити» / «Повідомити про надходження» is the design, but the
 * back-in-stock subscription does not exist yet (TASK-1066). So, like every
 * other parked control (compare, 1-click — TASK-419), it shows only behind
 * `FEATURE_STUBS`, as a «незабаром» toast; TASK-1066 replaces the handler.
 * Without the flag the button stays honest: disabled, outlined, and its label
 * says why («Немає в наявності»).
 */
function OutOfStockButton({
  compact,
  className,
}: {
  compact: boolean;
  className: string;
}) {
  const shape = compact ? "w-full font-semibold" : "h-12 w-full font-semibold";
  const outline =
    "border-border bg-card text-foreground shadow-none hover:bg-muted hover:text-foreground disabled:border-border disabled:bg-card disabled:text-muted-foreground dark:bg-card";

  if (FEATURE_STUBS) {
    return (
      <Button
        type="button"
        variant="outline"
        size={compact ? "sm" : "default"}
        onClick={() => toast(dict.deviceFit.notify.stub)}
        className={cn(shape, outline, className)}
      >
        {compact ? dict.deviceFit.notify.short : dict.deviceFit.notify.long}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? "sm" : "default"}
      disabled
      className={cn(shape, outline, className)}
    >
      {dict.addToCart.outOfStock}
    </Button>
  );
}

interface AddToCartButtonProps {
  productId: string;
  quantity?: number;
  disabled?: boolean;
  className?: string;
  /**
   * Compact rendering for product cards — a smaller pill with a cart icon and
   * toast-only error feedback (no inline alert, to keep card heights stable).
   * Default rendering (large block button) is unchanged for the PDP.
   */
  compact?: boolean;
  /**
   * The product position is out of stock: renders the outline out-of-stock
   * CTA instead (see `OutOfStockButton` — «Повідомити» behind FEATURE_STUBS,
   * otherwise a disabled «Немає в наявності»). Used by cards and the PDP.
   */
  outOfStock?: boolean;
  /**
   * Optional accessible name override. Used by the card quick-add overlay to
   * announce the specific product (e.g. "Швидко додати «iPhone Case» до
   * кошика") since the visible compact label is generic. Falls back to the
   * visible label when unset.
   */
  ariaLabel?: string;
}

/**
 * AddToCartButton — adds a product position to the cart via the generated
 * useAddToCart hook, then invalidates the cart query so the header and CartPage
 * refetch. Works for guests (cartToken cookie) and users alike.
 */
export function AddToCartButton({
  productId,
  quantity = 1,
  disabled = false,
  className = "",
  compact = false,
  outOfStock = false,
  ariaLabel,
}: AddToCartButtonProps) {
  const queryClient = useQueryClient();

  const addToCart = useAddToCart({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
        toast.success(dict.addToCart.added);
        // Analytics: report the add-to-cart (funnel step 2).
        trackEvent("add_to_cart", { productId, quantity });
      },
      onError: () => {
        if (compact) toast.error(dict.addToCart.error);
      },
    },
  });

  const handleClick = () => {
    addToCart.mutate({
      data: { productId, quantity },
    });
  };

  // Deliberately NO `isSuccess` label (TASK-409). `isSuccess` is a property of
  // THIS mutation instance and never clears, so the button froze on «Додано ✓»
  // for the rest of the page's life: the shopper could not tell whether a second
  // click had registered, and after removing the line from the cart the button
  // still claimed the product was in it. Success is announced by the toast (and
  // by the cart badge); the persistent «in the cart» state belongs to whoever
  // reads the cart — `ProductCardActions` and the PDP buy box both derive it
  // from `useGetCart`, which stays true after a reload and false after a removal.
  const label = addToCart.isPending
    ? dict.addToCart.adding
    : dict.addToCart.idle;

  const isDisabled = disabled || outOfStock || addToCart.isPending;

  if (outOfStock) {
    return <OutOfStockButton compact={compact} className={className} />;
  }

  if (compact) {
    // Card "Купити" button (mockup): a filled primary CTA.
    // No `isSuccess` branch here either — see the note on `label` above.
    const compactLabel = addToCart.isPending
      ? dict.addToCart.adding
      : dict.addToCart.buy;

    return (
      <Button
        type="button"
        size="sm"
        onClick={handleClick}
        disabled={isDisabled}
        aria-label={ariaLabel}
        className={cn(
          "w-full font-semibold transition-all active:scale-99 motion-reduce:active:scale-100",
          className,
        )}
      >
        {compactLabel}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        className={cn(
          "w-full rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        {label}
      </button>
      {addToCart.isError && (
        <p role="alert" className="text-sm text-destructive">
          {dict.addToCart.error}
        </p>
      )}
    </div>
  );
}
