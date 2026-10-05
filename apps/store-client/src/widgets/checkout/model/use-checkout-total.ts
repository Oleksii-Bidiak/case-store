"use client";

import { useGetCart } from "@/entities/cart";
import { useEstimateDelivery } from "@/entities/delivery";
import { useAppliedDiscount } from "@/features/apply-discount";
import { formatMoney } from "@/shared/lib";

/**
 * useCheckoutTotal — the checkout's «До сплати» and everything it is made of:
 * the cached cart (`useGetCart`, no extra round-trip), the live Nova Poshta
 * estimate for the chosen city (TASK-080) and the applied coupon (TASK-079).
 *
 * One source for the two places that print the total — the order summary and
 * the mobile «До сплати» bar (TASK-864) — so they can never disagree. React
 * Query dedupes the requests between them. The server recomputes the total
 * authoritatively at order creation.
 */
export function useCheckoutTotal(npCityRef?: string) {
  const cartQuery = useGetCart();
  const applied = useAppliedDiscount();

  const {
    data: estimateData,
    isFetching: isEstimating,
    // TASK-402: a failed estimate was indistinguishable from a zero-cost one,
    // and both fell through to a row that printed a delivery ETA where a price
    // belongs. They now say the same honest thing — an operator will confirm the
    // shipping cost — because that is exactly what happens next in either case.
    isError: isEstimateError,
  } = useEstimateDelivery(
    { cityRef: npCityRef ?? "" },
    { query: { enabled: Boolean(npCityRef) } },
  );
  const estimate = estimateData?.data;
  const hasCost =
    !isEstimateError && estimate ? Number(estimate.cost) > 0 : false;

  const totals = cartQuery.data?.data?.totals;
  const subtotalCents = Math.round(parseFloat(totals?.subtotal ?? "0") * 100);
  const couponCents = applied
    ? Math.round(parseFloat(applied.amount) * 100)
    : 0;
  const shipCents =
    hasCost && estimate ? Math.round(Number(estimate.cost) * 100) : 0;
  const totalCents = Math.max(0, subtotalCents - couponCents + shipCents);

  return {
    cartQuery,
    estimate,
    isEstimating,
    hasCost,
    /** Formatted «До сплати»; `undefined` until the cart has loaded. */
    totalText: totals ? formatMoney((totalCents / 100).toFixed(2)) : undefined,
  };
}
