"use client";

import { Check, Lock } from "lucide-react";
import { ApplyDiscount } from "@/features/apply-discount";
import {
  centsToMoney,
  deliveryMethodShortTitle,
  type CheckoutDeliveryMethod,
  type DeliveryQuote,
} from "@/features/checkout";
import { ProductThumb, Skeleton } from "@/shared/ui";
import { formatMoney } from "@/shared/lib";
import { dict } from "@/shared/config";
import { useCheckoutTotal } from "../model/use-checkout-total";

/**
 * The shipping cell (CheckoutDelivery.dc.html, «Ваше замовлення»): a sum in
 * mono; «Безкоштовно» with a success tick (the word stays foreground — green
 * text at this size is below 4.5:1); «Уточнить оператор» in muted italic and
 * NOT mono, because it is a sentence, not a number.
 */
function ShippingValue({ quote }: { quote: DeliveryQuote }) {
  switch (quote.kind) {
    case "amount":
      return (
        <span className="font-mono text-foreground">
          {centsToMoney(quote.cents)}
        </span>
      );
    case "free":
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-foreground">
          <Check className="size-3.5 text-success" aria-hidden />
          {dict.checkout.delivery.free}
        </span>
      );
    case "calculating":
      return (
        <span className="text-foreground">
          {dict.checkout.shippingCalculating}
        </span>
      );
    case "select-city":
      return (
        <span className="text-right text-foreground">
          {dict.checkout.shippingSelectCity}
        </span>
      );
    case "pending":
    default:
      return (
        <span className="text-muted-foreground italic">
          {dict.checkout.shippingCostUnknown}
        </span>
      );
  }
}

interface CheckoutOrderSummaryProps {
  /** The chosen delivery method (TASK-646); Nova Poshta when omitted. */
  method?: CheckoutDeliveryMethod;
  /** The Nova Poshta manual path (TASK-1097) — priced by an operator. */
  npManual?: boolean;
  /** NP city ref of the selected city; drives the live shipping estimate. */
  npCityRef?: string;
}

/**
 * CheckoutOrderSummary — the "Ваше замовлення" panel (Checkout.dc.html styling).
 * Reuses the cached `useGetCart` query (no extra round-trip), the delivery quote
 * for the chosen method (TASK-646 — the NP estimate of TASK-080, the courier's
 * price or free threshold, a free pickup, or «Уточнить оператор») and the real
 * promo code (`ApplyDiscount`, TASK-079). The server recomputes authoritatively
 * at order creation.
 */
export function CheckoutOrderSummary({
  method = "NOVA_POSHTA",
  npManual = false,
  npCityRef,
}: CheckoutOrderSummaryProps) {
  // The total's arithmetic is shared with the mobile «До сплати» bar
  // (TASK-864) — see `useCheckoutTotal` for the delivery / coupon rules.
  const {
    cartQuery: { data, isLoading, isError },
    quote,
    excludesShipping,
    totalText = formatMoney("0.00"),
  } = useCheckoutTotal({ method, npManual, npCityRef });
  const isNovaPoshta = method === "NOVA_POSHTA" && !npManual;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-[22px]">
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

  return (
    <div className="rounded-card border border-border bg-card p-[22px] shadow-card">
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

      {/* Promo code (real coupons, TASK-079). Kept visible for guests rather
          than hidden (TASK-402): a shopper who was handed a code and finds no
          field for it concludes the site lost it, and hiding the control is
          also the one option that cannot explain itself. ApplyDiscount shows
          guests the "sign in first" hint instead, pointing back HERE. */}
      <ApplyDiscount redirectTo="/checkout" />

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

        <div className="flex justify-between gap-3 py-1.5 text-sm text-muted-foreground">
          <span>
            {/* The method the shopper picked, as the review names it — even on
                the manual path, which the server books as OTHER. */}
            {dict.checkout.delivery.summaryLine(
              deliveryMethodShortTitle(method),
            )}
          </span>
          <ShippingValue quote={quote} />
        </div>

        {/* An ETA belongs to Nova Poshta proper — never to a pickup, a courier
            or an address typed by hand. */}
        {isNovaPoshta && quote.kind === "amount" && quote.etaDays != null && (
          <div className="flex justify-between py-1.5 text-sm text-muted-foreground">
            <span>{dict.checkout.deliveryEstimateLabel}</span>
            <span className="text-foreground">
              {dict.checkout.etaValue(quote.etaDays)}
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
        {excludesShipping && (
          <p className="mt-1 text-right text-xs text-muted-foreground">
            {dict.checkout.delivery.summaryWithoutShipping}
          </p>
        )}
      </div>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Lock className="size-3.5" aria-hidden="true" />
        {dict.checkout.secureNote}
      </p>
    </div>
  );
}
