"use client";

import { AlertTriangle, Check } from "lucide-react";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui";

interface ProductInCartButtonProps {
  productName: string;
  /** Read off the position: in stock → «В кошику», sold out → «Товар закінчився». */
  inStock: boolean;
  /** Opens the mini-cart — the one place the line can be changed or dropped. */
  onOpenCart: () => void;
  /**
   * The sticky mobile bar's size: the same `sm` height as the «Купити» button
   * it replaces, so the bar does not change height when the state flips.
   */
  compact?: boolean;
}

/**
 * ProductInCartButton — what the PDP shows instead of «Додати до кошика» once
 * the cart already holds this position (TASK-409). Two readings of that fact:
 * the position is waiting (success), or it sold out while it waited
 * (destructive — the shopper learns it here, not at checkout).
 *
 * One component for the buy box and the mobile bar (TASK-874): the bar used to
 * keep offering «Купити» for a product that was already in the cart, so the two
 * CTAs on one phone screen disagreed.
 */
export function ProductInCartButton({
  productName,
  inStock,
  onOpenCart,
  compact = false,
}: ProductInCartButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? "sm" : "default"}
      onClick={onOpenCart}
      aria-label={
        inStock
          ? dict.addToCart.inCartAria(productName)
          : dict.addToCart.soldOutAria(productName)
      }
      className={cn(
        "w-full font-semibold transition-colors",
        !compact && "h-12",
        inStock
          ? "border-success/40 text-success hover:bg-success/10 hover:text-success"
          : "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive",
      )}
    >
      {inStock ? (
        <Check aria-hidden="true" className="size-4" />
      ) : (
        <AlertTriangle aria-hidden="true" className="size-4" />
      )}
      {inStock ? dict.addToCart.inCart : dict.addToCart.soldOut}
    </Button>
  );
}
