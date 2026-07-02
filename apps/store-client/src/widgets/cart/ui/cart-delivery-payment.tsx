import { dict } from "@/shared/config";

// Delivery + payment picker cards on the cart page — UI STUBS. The real
// selection (Nova Poshta city/warehouse + payment) happens on /checkout
// (TASK-080 / TASK-034). These are presentational only and carry no state.

const SELECT_CLASS =
  "h-10 w-full rounded-[9px] border-[1.5px] border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-primary";

export function CartDeliveryStub() {
  return (
    <div className="rounded-[18px] border border-border bg-card p-[22px] shadow-[var(--shadow-card)]">
      <h3 className="mb-3.5 font-display text-[15px] font-bold text-foreground">
        {dict.cart.deliveryTitle}
      </h3>
      <label className="mb-2.5 flex items-center gap-2">
        <span className="min-w-[42px] text-[13px] text-muted-foreground">
          {dict.cart.deliveryCityLabel}
        </span>
        <select
          aria-label={dict.cart.deliveryCityLabel}
          className={SELECT_CLASS}
        >
          {dict.cart.deliveryCities.map((city) => (
            <option key={city}>{city}</option>
          ))}
        </select>
      </label>
      <select
        aria-label={dict.cart.deliveryMethodAria}
        className={SELECT_CLASS}
      >
        {dict.cart.deliveryMethods.map((method) => (
          <option key={method}>{method}</option>
        ))}
      </select>
    </div>
  );
}

const RADIO_ROW =
  "flex cursor-pointer items-center gap-2.5 rounded-[10px] border-[1.5px] px-3 py-[11px]";

export function CartPaymentStub() {
  return (
    <div className="rounded-[18px] border border-border bg-card p-[22px] shadow-[var(--shadow-card)]">
      <h3 className="mb-3 font-display text-[15px] font-bold text-foreground">
        {dict.cart.paymentTitle}
      </h3>
      <div
        className="flex flex-col gap-2"
        role="radiogroup"
        aria-label={dict.cart.paymentAria}
      >
        <label className={`${RADIO_ROW} border-primary`}>
          <input
            type="radio"
            name="cart-payment"
            defaultChecked
            className="size-4 accent-[var(--color-primary)]"
          />
          <span className="text-sm text-foreground">{dict.cart.payOnline}</span>
        </label>
        <label className={`${RADIO_ROW} border-border`}>
          <input
            type="radio"
            name="cart-payment"
            className="size-4 accent-[var(--color-primary)]"
          />
          <span className="text-sm text-foreground">
            {dict.cart.payOnDelivery}
          </span>
        </label>
      </div>
    </div>
  );
}
