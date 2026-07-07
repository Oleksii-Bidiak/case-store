"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getGetCartQueryKey, useAddToCart } from "@/entities/cart";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";
import { trackEvent } from "@/shared/lib";

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
   * The product position is out of stock. Disables the button and, in compact
   * (card) rendering, swaps the label to "Немає в наявності" so the unavailable
   * state is communicated without a separate stock indicator. On the PDP the
   * `ProductStockIndicator` already shows the message, so callers there pass
   * `disabled` instead and leave this unset.
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

  const label = addToCart.isPending
    ? dict.addToCart.adding
    : addToCart.isSuccess
      ? dict.addToCart.added
      : dict.addToCart.idle;

  const isDisabled = disabled || outOfStock || addToCart.isPending;

  if (compact) {
    // Card "Купити" button (mockup): a filled primary CTA. Out-of-stock takes
    // precedence so the card communicates the state inline via the label.
    const compactLabel = outOfStock
      ? dict.addToCart.outOfStock
      : addToCart.isPending
        ? dict.addToCart.adding
        : addToCart.isSuccess
          ? dict.addToCart.added
          : dict.addToCart.buy;

    return (
      <Button
        type="button"
        size="sm"
        onClick={handleClick}
        disabled={isDisabled}
        // Out of stock: drop the override so the visible "Немає в наявності"
        // label remains the accessible name (conveys WHY it is disabled).
        aria-label={outOfStock ? undefined : ariaLabel}
        className={`w-full cursor-pointer font-semibold transition-all active:scale-[0.99] ${className}`}
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
        className={`w-full rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
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
