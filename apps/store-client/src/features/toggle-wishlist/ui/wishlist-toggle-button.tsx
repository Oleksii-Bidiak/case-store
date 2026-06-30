"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Heart } from "lucide-react";
import { useAuth } from "@/entities/session";
import {
  getGetWishlistQueryKey,
  useGetWishlist,
  useToggleWishlist,
  type GetWishlist200,
  type WishlistItemEntity,
} from "@/entities/wishlist";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

interface WishlistToggleButtonProps {
  /** Product (position) id to save / unsave. */
  productId: string;
  /** Product name, woven into the accessible label. */
  productName: string;
  /**
   * Visual style:
   * - `overlay` (default) — a circular icon button for the ProductCard image
   *   corner (translucent backdrop, always visible).
   * - `inline` — a bordered pill-height icon button for the PDP info column.
   */
  variant?: "overlay" | "inline";
  className?: string;
}

/**
 * WishlistToggleButton — heart toggle that saves/unsaves a product via the
 * generated useToggleWishlist hook. Works for guests (wishlistToken cookie) and
 * users alike.
 *
 * The saved state is derived from the single cached useGetWishlist query (shared
 * by every heart on the page). The toggle is optimistic: the cache flips
 * immediately and rolls back on error, then onSettled invalidates so the badge
 * and any open wishlist grid reconcile with the server.
 *
 * a11y: a real <button> with `aria-pressed` reflecting the saved state and an
 * aria-label that names the product and the action; reachable by keyboard.
 */
export function WishlistToggleButton({
  productId,
  productName,
  variant = "overlay",
  className,
}: WishlistToggleButtonProps) {
  const queryClient = useQueryClient();

  // Hold the query until auth bootstrap settles so the heart never reflects a
  // transient empty guest wishlist minted during refresh (TASK-118 pattern).
  const { isInitializing } = useAuth();
  const { data } = useGetWishlist({ query: { enabled: !isInitializing } });

  const saved =
    data?.data?.items.some((item) => item.productId === productId) ?? false;

  const queryKey = getGetWishlistQueryKey();

  const toggle = useToggleWishlist({
    mutation: {
      // Optimistically flip the cached saved state for an instant heart.
      onMutate: async () => {
        await queryClient.cancelQueries({ queryKey });
        const previous = queryClient.getQueryData<GetWishlist200>(queryKey);

        queryClient.setQueryData<GetWishlist200>(queryKey, (old) => {
          if (!old?.data) return old;
          const current = old.data;
          const exists = current.items.some(
            (item) => item.productId === productId,
          );
          const items = exists
            ? current.items.filter((item) => item.productId !== productId)
            : [
                ...current.items,
                // Minimal placeholder — only productId/itemCount drive the heart
                // and the badge. onSettled refetches the full item shortly after.
                { productId } as WishlistItemEntity,
              ];
          return {
            ...old,
            data: { ...current, items, itemCount: items.length },
          };
        });

        return { previous };
      },
      onError: (_error, _vars, context) => {
        const previous = (context as { previous?: GetWishlist200 } | undefined)
          ?.previous;
        if (previous) {
          queryClient.setQueryData(queryKey, previous);
        }
        toast.error(dict.wishlist.error);
      },
      onSettled: () => {
        void queryClient.invalidateQueries({ queryKey });
      },
    },
  });

  const handleClick = () => {
    toggle.mutate({ data: { productId } });
  };

  const label = saved
    ? dict.productCard.wishlistRemoveAria(productName)
    : dict.productCard.wishlistAddAria(productName);

  const base =
    "inline-flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
  const variantClass =
    variant === "overlay"
      ? "size-9 rounded-full bg-background/80 text-foreground backdrop-blur-sm hover:bg-background shadow-sm"
      : "size-11 rounded-lg border border-border bg-background text-foreground hover:bg-accent";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={toggle.isPending}
      aria-pressed={saved}
      aria-label={label}
      className={cn(base, variantClass, className)}
    >
      <Heart
        aria-hidden="true"
        className={cn(
          "size-5 transition-colors",
          saved ? "fill-sale text-sale" : "text-current",
        )}
      />
    </button>
  );
}
