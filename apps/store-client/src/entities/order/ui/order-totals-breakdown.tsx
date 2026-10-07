import type { ReactNode } from "react";
import { Check } from "lucide-react";
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
   * The booked 0 is a placeholder nobody has priced — OTHER, or a Nova Poshta
   * order whose estimate never came (`orderDeliveryDetails().shippingCostPending`,
   * the API's rule). Never «Безкоштовно»: «Уточнить оператор», and a note under
   * «Разом» that the total leaves the delivery out.
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
  value: ReactNode;
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
 * «Доставка», «Податок» when non-zero, a rule, and «Разом» in the display face.
 * Shared by the order confirmation page, the guest order page and the account
 * order detail.
 *
 * «Доставка» has three faces (TASK-647, OrderConfirmation.dc.html), the same as
 * the checkout summary: a sum; «Безкоштовно» with a success tick (the word
 * stays foreground — green text at this size is below 4.5:1) for a pickup or a
 * courier over its threshold; «Уточнить оператор» in muted italic when nobody
 * priced it — and then «Без доставки — її вартість уточнить оператор» under
 * «Разом».
 *
 * Every figure is the server's pre-computed string — no client arithmetic:
 * `total = subtotal + shippingCost + addonsTotal − discount`.
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
  const priced = isNonZero(shippingCost);
  const pending = !priced && shippingPending;

  let shipping: ReactNode;
  let shippingClassName = "text-foreground";
  if (priced) {
    shipping = formatMoney(shippingCost);
  } else if (pending) {
    shipping = dict.order.shippingPending;
    shippingClassName = "text-muted-foreground italic";
  } else {
    shipping = (
      <span className="inline-flex items-center gap-1 font-semibold">
        <Check className="size-3.5 text-success" aria-hidden />
        {dict.order.shippingFree}
      </span>
    );
  }

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
        <Row
          label={dict.order.shipping}
          value={shipping}
          valueClassName={shippingClassName}
        />
        {isNonZero(tax) && (
          <Row label={dict.order.tax} value={formatMoney(tax)} />
        )}
      </dl>

      <Separator />

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-foreground">
            {dict.order.total}
          </span>
          <span className="font-display text-xl font-bold whitespace-nowrap text-foreground">
            {formatMoney(total)}
          </span>
        </div>
        {pending && (
          <p className="text-right text-xs text-muted-foreground">
            {dict.order.deliveryBlock.totalWithoutShipping}
          </p>
        )}
      </div>

      {children}
    </section>
  );
}
