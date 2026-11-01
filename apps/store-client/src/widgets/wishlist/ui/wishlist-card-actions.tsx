"use client";

import { useState } from "react";
import { Check, Heart } from "lucide-react";
import { useGetCart } from "@/entities/cart";
import { useAuth } from "@/entities/session";
import type { WishlistItemEntity } from "@/entities/wishlist";
import { AddToCartButton } from "@/features/add-to-cart";
import { CartSheet } from "@/widgets/cart";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { isInStock } from "../model/wishlist-catalog";
import { WishlistFitMark } from "./wishlist-fit-mark";

interface WishlistCardActionsProps {
  item: WishlistItemEntity;
  /** From the product card; `undefined` while it loads. */
  compatibleDeviceModelIds: readonly string[] | undefined;
  /** Remove with undo — `useWishlistRemoval().remove`. */
  onRemove: (item: WishlistItemEntity) => void;
  /**
   * Render the fit mark here (the grid card). The list row places it under
   * the title instead, like the catalogue row.
   */
  showFit?: boolean;
  className?: string;
}

/**
 * The action block of a saved card — the catalogue card's
 * (`ProductCardActions`, Д3-2 Catalog §7) on the wishlist: the fit mark, the
 * stock line, then «Купити» (or «В кошику», which opens the mini-cart) and
 * the heart. The difference (Wishlist §18.5): the heart is always filled and
 * REMOVES the product — at once, with «Повернути» in a toast, never a confirm
 * dialog — so it is a plain button here, not the toggle.
 */
export function WishlistCardActions({
  item,
  compatibleDeviceModelIds,
  onRemove,
  showFit = true,
  className,
}: WishlistCardActionsProps) {
  const inStock = isInStock(item);

  // The cart query the header badge observes; held until auth settles so a
  // transient guest cart is never read (TASK-118).
  const { isInitializing } = useAuth();
  const { data } = useGetCart({ query: { enabled: !isInitializing } });
  const inCart =
    data?.data?.items?.some((line) => line.productId === item.productId) ??
    false;

  const [sheetMounted, setSheetMounted] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {showFit && (
        <WishlistFitMark compatibleDeviceModelIds={compatibleDeviceModelIds} />
      )}
      <p
        className={cn(
          "flex items-center gap-1.5 text-xs",
          inStock ? "text-success" : "text-muted-foreground",
        )}
      >
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-current"
        />
        {inStock
          ? dict.productCard.inStockLine
          : dict.productCard.outOfStockLine}
      </p>
      <div className="flex gap-2">
        {inCart ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setSheetMounted(true);
              setSheetOpen(true);
            }}
            aria-label={dict.productCard.inCartAria(item.productName)}
            className="h-10 flex-1 border-success/40 font-semibold text-success transition-all hover:bg-success/10 hover:text-success active:scale-99 motion-reduce:transition-none"
          >
            <Check aria-hidden="true" className="size-4" />
            {dict.productCard.inCart}
          </Button>
        ) : (
          <AddToCartButton
            productId={item.productId}
            compact
            outOfStock={!inStock}
            ariaLabel={dict.productCard.buyAria(item.productName)}
            className="h-10 flex-1"
          />
        )}
        <button
          type="button"
          onClick={() => onRemove(item)}
          aria-label={dict.productCard.wishlistRemoveAria(item.productName)}
          className="inline-flex h-10 w-10.5 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors outline-none hover:border-foreground/35 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring active:scale-98 motion-reduce:transition-none"
        >
          <Heart aria-hidden="true" className="size-5 fill-sale text-sale" />
        </button>
      </div>
      {sheetMounted && (
        <CartSheet open={sheetOpen} onOpenChange={setSheetOpen} />
      )}
    </div>
  );
}
