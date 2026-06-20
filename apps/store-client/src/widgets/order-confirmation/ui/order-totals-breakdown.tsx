import { formatMoney } from "@/shared/lib";
import { dict } from "@/shared/config";

interface OrderTotalsBreakdownProps {
  subtotal: string;
  discount: string;
  shippingCost: string;
  tax: string;
  total: string;
}

/** Gate optional rows — uses Number() only for the zero-check, never for display. */
function isNonZero(value: string): boolean {
  return Number(value) !== 0;
}

/**
 * OrderTotalsBreakdown — renders the cost breakdown for the order. Optional
 * lines (discount, shipping, tax) render only when non-zero. All values are
 * pre-computed strings from the backend; no client-side arithmetic is performed.
 */
export function OrderTotalsBreakdown({
  subtotal,
  discount,
  shippingCost,
  tax,
  total,
}: OrderTotalsBreakdownProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-6 text-card-foreground">
      <h2 className="text-lg font-semibold text-foreground">
        {dict.order.totalsTitle}
      </h2>

      <div className="flex items-center justify-between text-sm text-foreground">
        <span>{dict.order.subtotal}</span>
        <span>{formatMoney(subtotal)}</span>
      </div>

      {isNonZero(discount) && (
        <div className="flex items-center justify-between text-sm text-foreground">
          <span>{dict.order.discount}</span>
          <span>–{formatMoney(discount)}</span>
        </div>
      )}

      {isNonZero(shippingCost) && (
        <div className="flex items-center justify-between text-sm text-foreground">
          <span>{dict.order.shipping}</span>
          <span>{formatMoney(shippingCost)}</span>
        </div>
      )}

      {isNonZero(tax) && (
        <div className="flex items-center justify-between text-sm text-foreground">
          <span>{dict.order.tax}</span>
          <span>{formatMoney(tax)}</span>
        </div>
      )}

      <hr className="border-border" />

      <div className="flex items-center justify-between font-semibold text-foreground">
        <span>{dict.order.total}</span>
        <span>{formatMoney(total)}</span>
      </div>
    </div>
  );
}
