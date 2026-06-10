"use client";

import { useQueryClient } from "@tanstack/react-query";
import { getGetCartQueryKey, useAddToCart } from "@/entities/cart";

interface AddToCartButtonProps {
  productId: string;
  variantId?: string | null;
  quantity?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * AddToCartButton — adds a product (and optional variant) to the cart via the
 * generated useAddToCart hook, then invalidates the cart query so the header
 * and CartPage refetch. Works for guests (cartToken cookie) and users alike.
 */
export function AddToCartButton({
  productId,
  variantId,
  quantity = 1,
  disabled = false,
  className = "",
}: AddToCartButtonProps) {
  const queryClient = useQueryClient();

  const addToCart = useAddToCart({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() }),
    },
  });

  const handleClick = () => {
    addToCart.mutate({
      data: { productId, variantId: variantId ?? undefined, quantity },
    });
  };

  const label = addToCart.isPending
    ? "Adding…"
    : addToCart.isSuccess
      ? "Added ✓"
      : "Add to Cart";

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || addToCart.isPending}
        className={`w-full rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        {label}
      </button>
      {addToCart.isError && (
        <p role="alert" className="text-sm text-destructive">
          Could not add this item. Please try again.
        </p>
      )}
    </div>
  );
}
