import { OrderStatusBadge, type PublicOrderEntity } from "@/entities/order";
import { dict } from "@/shared/config";
import { formatDate, formatMoney } from "@/shared/lib/format";

/**
 * OrderLookupResult — one order as the public form is allowed to show it
 * (TASK-483).
 *
 * Renders exactly the fields `PublicOrderEntity` carries, which is the point:
 * there is no address line here because the API does not send one, and it does
 * not send one because the proof behind this page — knowing an order number and
 * a phone — is weaker than the proof behind the emailed link (B-5 §3). If a
 * future edit wants the street here, it has to go and add the field to a class
 * whose docblock explains why it is missing.
 *
 * Presentational: it renders data handed to it and owns no state. It runs as a
 * CLIENT component — its only caller is the `"use client"` `OrderLookupForm`,
 * and anything imported from a client module is client code.
 */
export function OrderLookupResult({ order }: { order: PublicOrderEntity }) {
  const d = dict.orderLookup;
  const hasDiscount = parseFloat(order.discount) > 0;
  const hasShipping = parseFloat(order.shippingCost) > 0;
  const hasAddons = parseFloat(order.addonsTotal) > 0;
  // A pickup line already names the shop's own address; the city row is for
  // the deliveries that travel somewhere.
  const showCity = order.deliveryMethod !== "PICKUP";
  // A waybill exists only for a carrier parcel — «Ще не передано
  // перевізнику» under a pickup would promise a carrier that never comes.
  const showTracking =
    order.deliveryMethod === "NOVA_POSHTA" || order.trackingNumber !== null;

  return (
    <article className="flex flex-col gap-5 rounded-card border border-border bg-card p-6 shadow-card sm:p-8">
      <header className="flex flex-col gap-3">
        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">{d.orderNumber}</dt>
            <dd className="font-mono font-semibold text-foreground">
              #{order.number}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">{d.placedOn}</dt>
            <dd className="text-foreground">{formatDate(order.createdAt)}</dd>
          </div>
        </dl>

        <dl className="flex flex-wrap items-center gap-2">
          <dt className="sr-only">{dict.order.orderStatusSr}</dt>
          <dd>
            <OrderStatusBadge status={order.status}>
              {dict.order.orderStatusLabels[order.status] ?? order.status}
            </OrderStatusBadge>
          </dd>
          <dt className="sr-only">{dict.order.paymentStatusSr}</dt>
          <dd>
            <OrderStatusBadge status={order.paymentStatus}>
              {dict.order.paymentLabel(order.paymentStatus)}
            </OrderStatusBadge>
          </dd>
        </dl>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-foreground">
          {d.itemsHeading}
        </h2>
        <ul className="flex flex-col gap-2">
          {order.items.map((item, index) => (
            <li
              key={`${item.productName}-${index}`}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2 last:border-b-0 last:pb-0"
            >
              <span className="text-sm text-foreground">
                {item.productName}{" "}
                <span className="text-muted-foreground">
                  {d.itemQuantity(item.quantity)}
                </span>
                {item.addons.length > 0 && (
                  <span className="block text-xs text-muted-foreground">
                    + {item.addons.join(", ")}
                  </span>
                )}
              </span>
              <span className="text-sm font-medium text-foreground">
                {formatMoney(item.lineTotal)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold text-foreground">
          {d.totalsHeading}
        </h2>
        <dl className="flex flex-col gap-1 text-sm">
          <Row label={d.subtotal} value={formatMoney(order.subtotal)} />
          {hasAddons && (
            <Row label={d.addons} value={formatMoney(order.addonsTotal)} />
          )}
          {hasDiscount && (
            <Row label={d.discount} value={`−${formatMoney(order.discount)}`} />
          )}
          {/* Always present (TASK-1030): a sum, «Безкоштовно», or — when the
              server says nobody priced it — «Уточнить оператор», never «0 ₴». */}
          {hasShipping ? (
            <Row label={d.shipping} value={formatMoney(order.shippingCost)} />
          ) : order.delivery.shippingCostPending ? (
            <Row
              label={d.shipping}
              value={d.shippingPending}
              valueClassName="text-muted-foreground italic"
            />
          ) : (
            <Row label={d.shipping} value={d.shippingFree} />
          )}
          <div className="flex items-baseline justify-between gap-2 border-t border-border pt-1.5">
            <dt className="font-semibold text-foreground">{d.total}</dt>
            <dd className="text-base font-bold text-foreground">
              {formatMoney(order.total)}
            </dd>
          </div>
        </dl>
        {/* The same note the confirmation page puts under «Разом» — without
            it, a total that leaves delivery out reads as the final sum. Kept
            outside the <dl>: a <p> is not valid content there (TASK-868). */}
        {!hasShipping && order.delivery.shippingCostPending && (
          <p className="text-right text-xs text-muted-foreground">
            {dict.order.deliveryBlock.totalWithoutShipping}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold text-foreground">
          {d.deliveryHeading}
        </h2>
        {/* Only <div>-wrapped dt/dd groups inside the <dl> (TASK-868): the two
            plain statements used to be bare <p>s in it, which is invalid
            content for a description list. They are now a dd under a visually
            hidden «Доставка» term, and look exactly as before. */}
        <dl className="flex flex-col gap-1 text-sm">
          {/* The real method (TASK-1030) — never the street. The API has no
              field for the buyer's street to arrive in, which is the design,
              not an omission; a pickup address is the shop's own. */}
          <Statement
            term={d.deliveryHeading}
            text={deliveryLine(order)}
            className="text-foreground"
          />
          {showCity &&
            (order.delivery.city ? (
              <Row label={d.deliveryCity} value={order.delivery.city} />
            ) : (
              <Statement term={d.deliveryHeading} text={d.deliveryUnknown} />
            ))}
          {showTracking && (
            <Row
              label={d.trackingHeading}
              value={order.trackingNumber ?? d.trackingNone}
            />
          )}
        </dl>
      </section>
    </article>
  );
}

/**
 * The delivery line by the real method (TASK-1030): «Нова Пошта: <відділення>»,
 * «Самовивіз: <точка>, <адреса>», «Кур'єр», «Інший спосіб — вартість уточнить
 * менеджер». Before it, a branch-less order read «Курʼєром за вказаною
 * адресою» whatever its method — a pickup told the buyer a courier was coming.
 */
function deliveryLine(order: PublicOrderEntity): string {
  const d = dict.orderLookup;
  switch (order.deliveryMethod) {
    case "PICKUP":
      return d.deliveryPickup(
        [order.delivery.pickupPointName, order.delivery.pickupPointAddress]
          .filter(Boolean)
          .join(", "),
      );
    case "COURIER":
      return d.deliveryCourierMethod;
    case "OTHER":
      // The "manager will quote it" promise only while nobody has — once the
      // totals row shows a price, the line must not contradict it.
      return order.delivery.shippingCostPending
        ? d.deliveryOther
        : d.deliveryOtherPriced;
    case "NOVA_POSHTA":
    default:
      return d.deliveryNovaPoshta(order.delivery.warehouse);
  }
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
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={valueClassName}>{value}</dd>
    </div>
  );
}

/** A sentence in place of a value: the term is for screen readers only. */
function Statement({
  term,
  text,
  className = "text-muted-foreground",
}: {
  term: string;
  text: string;
  className?: string;
}) {
  return (
    <div>
      <dt className="sr-only">{term}</dt>
      <dd className={className}>{text}</dd>
    </div>
  );
}
