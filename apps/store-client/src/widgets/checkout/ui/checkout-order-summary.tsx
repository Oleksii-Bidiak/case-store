"use client";

import { Lock } from "lucide-react";
import { useGetCart } from "@/entities/cart";
import { useEstimateDelivery } from "@/entities/delivery";
import { ApplyDiscount, useAppliedDiscount } from "@/features/apply-discount";
import { ProductThumb, Skeleton } from "@/shared/ui";
import { formatMoney } from "@/shared/lib";
import { dict } from "@/shared/config";

interface CheckoutOrderSummaryProps {
  /** NP city ref of the selected city; drives the live shipping estimate. */
  npCityRef?: string;
}

/**
 * CheckoutOrderSummary — the "Ваше замовлення" panel (Checkout.dc.html styling).
 * Reuses the cached `useGetCart` query (no extra round-trip), the real Nova
 * Poshta shipping estimate (TASK-080), and the real promo code (`ApplyDiscount`,
 * TASK-079). The server recomputes authoritatively at order creation.
 */
export function CheckoutOrderSummary({ npCityRef }: CheckoutOrderSummaryProps) {
  const { data, isLoading, isError } = useGetCart();
  const applied = useAppliedDiscount();

  const { data: estimateData, isFetching: isEstimating } = useEstimateDelivery(
    { cityRef: npCityRef ?? "" },
    { query: { enabled: Boolean(npCityRef) } },
  );
  const estimate = estimateData?.data;
  const hasCost = estimate ? Number(estimate.cost) > 0 : false;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 rounded-[18px] border border-border bg-card p-[22px]">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-px w-full" />
        <Skeleton className="h-8 w-2/3" />
      </div>
    );
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.checkout.summaryError}
      </p>
    );
  }

  const cart = data?.data;
  const items = cart?.items ?? [];
  const totals = cart?.totals;

  const subtotalCents = Math.round(parseFloat(totals?.subtotal ?? "0") * 100);
  const couponCents = applied
    ? Math.round(parseFloat(applied.amount) * 100)
    : 0;
  const shipCents =
    hasCost && estimate ? Math.round(Number(estimate.cost) * 100) : 0;
  const totalCents = Math.max(0, subtotalCents - couponCents + shipCents);
  const totalText = formatMoney((totalCents / 100).toFixed(2));

  return (
    <div className="rounded-[18px] border border-border bg-card p-[22px] shadow-card">
      <h2 className="mb-4 font-display text-lg font-bold text-foreground">
        {dict.checkout.summaryHeading}
      </h2>

      <ul className="mb-4 flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3">
            <span className="relative shrink-0">
              <ProductThumb
                name={item.productName}
                className="size-12 rounded-md"
                initialClassName="text-base"
              />
              <span className="absolute -top-[7px] -right-[7px] inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                {item.quantity}
              </span>
            </span>
            <span className="min-w-0 flex-1 text-[13px] leading-[1.35] text-foreground">
              {item.productName}
            </span>
            <b className="font-mono text-[13px] whitespace-nowrap text-foreground">
              {formatMoney(item.lineTotal)}
            </b>
          </li>
        ))}
      </ul>

      {/* Promo code (real coupons, TASK-079). */}
      <ApplyDiscount />

      <div className="mt-3 border-t border-border pt-3">
        <div className="flex justify-between py-1.5 text-sm text-muted-foreground">
          <span>
            {dict.checkout.itemsLine} (
            {dict.checkout.countShort(totals?.itemCount ?? 0)})
          </span>
          <span className="font-mono text-foreground">
            {formatMoney(totals?.subtotal ?? "0")}
          </span>
        </div>

        <div className="flex justify-between py-1.5 text-sm text-muted-foreground">
          <span>{dict.checkout.shippingCostLabel}</span>
          <span className="font-mono text-foreground">
            {!npCityRef
              ? dict.checkout.shippingSelectCity
              : isEstimating
                ? dict.checkout.shippingCalculating
                : hasCost && estimate
                  ? formatMoney(estimate.cost)
                  : dict.checkout.deliveryEstimateValue}
          </span>
        </div>

        {npCityRef && !isEstimating && estimate?.etaDays != null && (
          <div className="flex justify-between py-1.5 text-sm text-muted-foreground">
            <span>{dict.checkout.deliveryEstimateLabel}</span>
            <span className="text-foreground">
              {dict.checkout.etaValue(estimate.etaDays)}
            </span>
          </div>
        )}

        <div className="my-2.5 h-px bg-border" />

        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-semibold text-foreground">
            {dict.checkout.totalLine}
          </span>
          <span className="font-display text-[26px] font-bold text-foreground">
            {totalText}
          </span>
        </div>
      </div>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Lock className="size-3.5" aria-hidden="true" />
        {dict.checkout.secureNote}
      </p>
    </div>
  );
}
