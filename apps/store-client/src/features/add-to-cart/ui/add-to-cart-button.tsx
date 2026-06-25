"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShoppingCart } from "lucide-react";
import { getGetCartQueryKey, useAddToCart } from "@/entities/cart";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

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
}: AddToCartButtonProps) {
  const queryClient = useQueryClient();

  const addToCart = useAddToCart({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
        toast.success(dict.addToCart.added);
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

  if (compact) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleClick}
        disabled={disabled || addToCart.isPending}
        className={`w-full font-semibold transition-colors hover:bg-primary hover:text-primary-foreground hover:border-primary ${className}`}
      >
        <ShoppingCart aria-hidden="true" />
        {label}
      </Button>
    );
  }

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
          {dict.addToCart.error}
        </p>
      )}
    </div>
  );
}
