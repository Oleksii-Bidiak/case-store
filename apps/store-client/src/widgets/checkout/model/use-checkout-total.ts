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
 * applied coupon (TASK-079), plus the selected add-on services (TASK-2519).
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
  // Add-on services (TASK-2519) are charged on top and never discounted — the
  // coupon is clamped against the goods subtotal alone, as the server and the
  // cart page do: total = subtotal − discount + shipping + addonsTotal.
  const addonsCents = Math.max(0, toCents(totals?.addonsTotal));
  const totalCents =
    Math.max(0, subtotalCents - couponCents) + shipCents + addonsCents;

  return {
    cartQuery,
    quote,
    /**
     * Nobody has priced the delivery (TASK-646): the total is goods only, and
     * the summary says so under it rather than letting it pass for the bill.
     */
    excludesShipping: quote.kind === "pending",
    /** Selected add-on services in cents; 0 when none is selected. */
    addonsCents,
    /** Formatted «До сплати»; `undefined` until the cart has loaded. */
    totalText: totals ? centsToMoney(totalCents) : undefined,
  };
}
