import type { ReactNode } from "react";
import { dict } from "@/shared/config";
import { formatMoney } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import { Separator } from "@/shared/ui";

interface OrderTotalsBreakdownProps {
  subtotal: string;
  /** Σ add-on services (TASK-174). Absent or zero ⇒ no «Послуги» row. */
  addonsTotal?: string;
  discount: string;
  /** The promo code behind the discount, shown as «Знижка · CODE». */
  discountCode?: string | null;
  shippingCost: string;
  /**
   * The booked 0 is a placeholder the operator will price later (delivery
   * OTHER, `shippingAddress.shippingCostPending`) — never «Безкоштовно».
   */
  shippingPending?: boolean;
  tax: string;
  total: string;
  /** Merged over the card frame (`cn`), e.g. a roomier padding. */
  className?: string;
  /** Under the total — the detail's «Спосіб оплати» tile. */
  children?: ReactNode;
}

/** Gate optional rows — uses Number() only for the zero-check, never for display. */
function isNonZero(value: string | undefined): value is string {
  return value !== undefined && Number(value) !== 0;
}

function Row({
  label,
  value,
  valueClassName = "text-foreground",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-right whitespace-nowrap", valueClassName)}>
        {value}
      </dd>
    </div>
  );
}

/**
 * OrderTotalsBreakdown — «Підсумок замовлення» (TASK-217,
 * AccountOrders.dc.html): «Сума», «Послуги» (only when the order bought add-on
 * services), «Знижка · CODE» in the sale colour with an en-dash minus,
 * «Доставка» (0 reads «Безкоштовно»), «Податок» when non-zero, a rule, and
 * «Разом» in the display face. Shared by the order confirmation page and the
 * account order detail.
 *
 * Every figure is the server's pre-computed string — no client arithmetic:
 * `total = subtotal + shippingCost + addonsTotal − discount`. Before TASK-217
 * the confirmation page skipped `addonsTotal`, so its rows did not add up to
 * its own total whenever a service was bought.
 */
export function OrderTotalsBreakdown({
  subtotal,
  addonsTotal,
  discount,
  discountCode,
  shippingCost,
  shippingPending = false,
  tax,
  total,
  className,
  children,
}: OrderTotalsBreakdownProps) {
  const shipping = isNonZero(shippingCost)
    ? formatMoney(shippingCost)
    : shippingPending
      ? dict.order.shippingPending
      : dict.order.shippingFree;

  return (
    <section
      data-testid="order-totals"
      className={cn(
        "flex flex-col gap-3 rounded-card border border-border bg-card p-5 text-card-foreground shadow-card",
        className,
      )}
    >
      <h2 className="text-lg font-semibold text-foreground">
        {dict.order.totalsTitle}
      </h2>

      <dl className="flex flex-col gap-3 text-sm">
        <Row label={dict.order.subtotal} value={formatMoney(subtotal)} />
        {isNonZero(addonsTotal) && (
          <Row label={dict.order.addons} value={formatMoney(addonsTotal)} />
        )}
        {isNonZero(discount) && (
          <Row
            label={
              discountCode
                ? dict.order.discountWithCode(discountCode)
                : dict.order.discount
            }
            value={`–${formatMoney(discount)}`}
            valueClassName="text-sale"
          />
        )}
        <Row label={dict.order.shipping} value={shipping} />
        {isNonZero(tax) && (
          <Row label={dict.order.tax} value={formatMoney(tax)} />
        )}
      </dl>

      <Separator />

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">
          {dict.order.total}
        </span>
        <span className="font-display text-xl font-bold whitespace-nowrap text-foreground">
          {formatMoney(total)}
        </span>
      </div>

      {children}
    </section>
  );
}
