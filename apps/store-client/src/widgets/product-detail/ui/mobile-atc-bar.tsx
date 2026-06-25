"use client";

import { AddToCartButton } from "@/features/add-to-cart";
import { formatMoney } from "@/shared/lib";

interface MobileAtcBarProps {
  productId: string;
  price: string;
  disabled?: boolean;
}

/**
 * MobileAtcBar — a sticky bottom bar shown only on mobile (`< md`) with the
 * current price and an Add-to-Cart action, so the primary CTA is always within
 * thumb reach while the shopper scrolls the description. The page adds bottom
 * padding so this never covers content.
 */
export function MobileAtcBar({
  productId,
  price,
  disabled = false,
}: MobileAtcBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 md:hidden">
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        <span className="font-display text-lg font-bold tracking-tight text-foreground">
          {formatMoney(price)}
        </span>
        <div className="flex-1">
          <AddToCartButton
            productId={productId}
            disabled={disabled}
            compact
            className="border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
          />
        </div>
      </div>
    </div>
  );
}
