interface OrderTotalsBreakdownProps {
  subtotal: string;
  discount: string;
  shippingCost: string;
  tax: string;
  total: string;
}

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatPrice(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? priceFormatter.format(amount) : value;
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
      <h2 className="text-lg font-semibold text-foreground">Order Summary</h2>

      <div className="flex items-center justify-between text-sm text-foreground">
        <span>Subtotal</span>
        <span>{formatPrice(subtotal)}</span>
      </div>

      {isNonZero(discount) && (
        <div className="flex items-center justify-between text-sm text-foreground">
          <span>Discount</span>
          <span>–{formatPrice(discount)}</span>
        </div>
      )}

      {isNonZero(shippingCost) && (
        <div className="flex items-center justify-between text-sm text-foreground">
          <span>Shipping</span>
          <span>{formatPrice(shippingCost)}</span>
        </div>
      )}

      {isNonZero(tax) && (
        <div className="flex items-center justify-between text-sm text-foreground">
          <span>Tax</span>
          <span>{formatPrice(tax)}</span>
        </div>
      )}

      <hr className="border-border" />

      <div className="flex items-center justify-between font-semibold text-foreground">
        <span>Total</span>
        <span>{formatPrice(total)}</span>
      </div>
    </div>
  );
}
