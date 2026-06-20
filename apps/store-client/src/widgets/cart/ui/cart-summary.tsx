"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock, Truck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCartQueryKey,
  useClearCart,
  type CartTotals,
} from "@/entities/cart";
import { formatMoney } from "@/shared/lib";
import { dict } from "@/shared/config";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Separator,
} from "@/shared/ui";

/**
 * CartSummary — order totals panel with checkout CTA, a trust strip, and a
 * clear-cart action confirmed via an accessible Dialog (no window.confirm).
 * Total equals subtotal for MVP (no discount/shipping yet).
 */
export function CartSummary({ totals }: { totals: CartTotals }) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const clearCart = useClearCart({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
        setConfirmOpen(false);
      },
    },
  });

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 text-card-foreground shadow-[var(--shadow-card)]">
      <h2 className="text-lg font-semibold text-foreground">
        {dict.cart.summaryTitle}
      </h2>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{dict.cart.subtotal}</span>
        <span className="text-foreground">{formatMoney(totals.subtotal)}</span>
      </div>
      <p className="text-sm text-muted-foreground">
        {dict.cart.itemsCount(totals.itemCount)}
      </p>

      <Separator />

      <div className="flex items-center justify-between font-semibold text-foreground">
        <span>{dict.cart.total}</span>
        <span>{formatMoney(totals.subtotal)}</span>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Truck className="size-4 text-primary" aria-hidden="true" />
        {dict.cart.shippingNotice}
      </p>

      <Button size="lg" asChild>
        <Link href="/checkout" aria-label={dict.cart.checkoutAria}>
          {dict.cart.checkout}
        </Link>
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {dict.cart.clear}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dict.cart.clearTitle}</DialogTitle>
            <DialogDescription>{dict.cart.clearDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{dict.cart.clearCancel}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={clearCart.isPending}
              onClick={() => clearCart.mutate()}
            >
              {clearCart.isPending
                ? dict.cart.clearing
                : dict.cart.clearConfirmAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Lock className="size-3.5" aria-hidden="true" />
        {dict.cart.secureCheckout}
      </p>

      {clearCart.error && (
        <p role="alert" className="text-sm text-destructive">
          {dict.cart.clearError}
        </p>
      )}
    </div>
  );
}
