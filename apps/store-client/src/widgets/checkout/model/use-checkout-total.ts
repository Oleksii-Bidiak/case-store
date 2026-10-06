"use client";

import { useGetCart } from "@/entities/cart";
import { useAppliedDiscount } from "@/features/apply-discount";
import {
  centsToMoney,
  toCents,
  useDeliveryQuote,
  type DeliverySelection,
} from "@/features/checkout";

/**
 * useCheckoutTotal — the checkout's «До сплати» and everything it is made of:
 * the cached cart (`useGetCart`, no extra round-trip), the delivery quote for
 * the chosen method (TASK-646: the Nova Poshta estimate, the courier's flat
 * price or its free threshold, a free pickup, or «уточнить оператор») and the
 * applied coupon (TASK-079).
 *
 * One source for the two places that print the total — the order summary and
 * the mobile «До сплати» bar (TASK-864) — so they can never disagree. React
 * Query dedupes the requests between them. The server recomputes the total
 * authoritatively at order creation.
 */
export function useCheckoutTotal(
  delivery: DeliverySelection = { method: "NOVA_POSHTA" },
) {
  const cartQuery = useGetCart();
  const applied = useAppliedDiscount();
  const { quote } = useDeliveryQuote(delivery);

  const totals = cartQuery.data?.data?.totals;
  const subtotalCents = toCents(totals?.subtotal);
  const couponCents = applied ? toCents(applied.amount) : 0;
  const shipCents = quote.kind === "amount" ? quote.cents : 0;
  const totalCents = Math.max(0, subtotalCents - couponCents + shipCents);

  return {
    cartQuery,
    quote,
    /**
     * Nobody has priced the delivery (TASK-646): the total is goods only, and
     * the summary says so under it rather than letting it pass for the bill.
     */
    excludesShipping: quote.kind === "pending",
    /** Formatted «До сплати»; `undefined` until the cart has loaded. */
    totalText: totals ? centsToMoney(totalCents) : undefined,
  };
}
