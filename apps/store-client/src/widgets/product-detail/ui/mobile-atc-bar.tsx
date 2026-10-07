"use client";

import { useRef } from "react";
import { AddToCartButton } from "@/features/add-to-cart";
import { formatMoney } from "@/shared/lib";
import { useMobileBarInset } from "@/shared/lib/use-mobile-bar-inset";
import { ProductInCartButton } from "./product-in-cart-button";

interface MobileAtcBarProps {
  productId: string;
  productName: string;
  price: string;
  inStock: boolean;
  /** The cart already holds this position — read by the view from `useGetCart`. */
  inCart: boolean;
  /** Opens the mini-cart; the same handler as the buy box's «В кошику». */
  onOpenCart: () => void;
}

/**
 * MobileAtcBar — a sticky bottom bar shown only on mobile (`< md`) with the
 * current price and the primary cart action, so it is always within thumb
 * reach while the shopper scrolls the description. The page adds bottom
 * padding so this never covers content.
 *
 * It mirrors the buy box's cart state (TASK-874): «Купити» while the position
 * is not in the cart, «В кошику» (or «Товар закінчився») once it is — the view
 * owns the cart read and hands the answer to both.
 *
 * It publishes its measured height while mounted (TASK-1771), so below `md` the
 * global toaster stacks above it — the «Купити» toast no longer covers the very
 * button that raised it (WCAG 2.4.11).
 */
export function MobileAtcBar({
  productId,
  productName,
  price,
  inStock,
  inCart,
  onOpenCart,
}: MobileAtcBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  useMobileBarInset(barRef);

  return (
    <div
      ref={barRef}
      data-testid="mobile-atc-bar"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 md:hidden"
    >
      <div className="mx-auto flex max-w-page items-center gap-3">
        <span className="font-display text-lg font-bold tracking-tight text-foreground">
          {formatMoney(price)}
        </span>
        <div className="flex-1">
          {inCart ? (
            <ProductInCartButton
              productName={productName}
              inStock={inStock}
              onOpenCart={onOpenCart}
              compact
            />
          ) : (
            <AddToCartButton
              productId={productId}
              disabled={!inStock}
              compact
              className="border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
            />
          )}
        </div>
      </div>
    </div>
  );
}
