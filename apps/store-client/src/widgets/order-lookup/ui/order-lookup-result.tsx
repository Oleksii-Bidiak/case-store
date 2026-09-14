import type { PublicOrderEntity } from "@/entities/order";
import { dict } from "@/shared/config";
import { formatMoney } from "@/shared/lib/format";

/** Token-based badge colours per status value (no raw hex) — same map the
 *  confirmation header uses, so one status never looks like two things. */
const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-muted text-muted-foreground",
  CONFIRMED: "bg-primary/10 text-primary",
  PROCESSING: "bg-primary/20 text-primary",
  SHIPPED: "bg-primary/30 text-primary",
  DELIVERED: "bg-primary/10 text-primary font-semibold",
  CANCELLED: "bg-destructive/10 text-destructive",
  REFUNDED: "bg-destructive/10 text-destructive",
  PARTIALLY_REFUNDED: "bg-destructive/10 text-destructive",
  PAID: "bg-primary/10 text-primary",
  FAILED: "bg-destructive/10 text-destructive",
};

const dateFormatter = new Intl.DateTimeFormat("uk-UA", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function badgeClass(value: string): string {
  return STATUS_BADGE[value] ?? "bg-muted text-muted-foreground";
}

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
 * Server component: it renders data handed to it and owns no state.
 */
export function OrderLookupResult({ order }: { order: PublicOrderEntity }) {
  const d = dict.orderLookup;
  const hasDiscount = parseFloat(order.discount) > 0;
  const hasShipping = parseFloat(order.shippingCost) > 0;
  const hasAddons = parseFloat(order.addonsTotal) > 0;

  return (
    <article className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
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
            <span
              aria-label={dict.order.orderStatusAria(order.status)}
              className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${badgeClass(order.status)}`}
            >
              {dict.order.orderStatusLabels[order.status] ?? order.status}
            </span>
          </dd>
          <dt className="sr-only">{dict.order.paymentStatusSr}</dt>
          <dd>
            <span
              aria-label={dict.order.paymentStatusAria(order.paymentStatus)}
              className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${badgeClass(order.paymentStatus)}`}
            >
              {dict.order.paymentLabel(order.paymentStatus)}
            </span>
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
          {hasShipping && (
            <Row label={d.shipping} value={formatMoney(order.shippingCost)} />
          )}
          <div className="flex items-baseline justify-between gap-2 border-t border-border pt-1.5">
            <dt className="font-semibold text-foreground">{d.total}</dt>
            <dd className="text-base font-bold text-foreground">
              {formatMoney(order.total)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold text-foreground">
          {d.deliveryHeading}
        </h2>
        <dl className="flex flex-col gap-1 text-sm">
          {order.delivery.city ? (
            <Row label={d.deliveryCity} value={order.delivery.city} />
          ) : (
            <p className="text-muted-foreground">{d.deliveryUnknown}</p>
          )}
          {/* A branch name, or the plain statement that a courier is bringing it
              — never the street. The API has no field for the street to arrive
              in, which is the design, not an omission. */}
          {order.delivery.city &&
            (order.delivery.warehouse ? (
              <Row
                label={d.deliveryWarehouse}
                value={order.delivery.warehouse}
              />
            ) : (
              <p className="text-muted-foreground">{d.deliveryCourier}</p>
            ))}
          <Row
            label={d.trackingHeading}
            value={order.trackingNumber ?? d.trackingNone}
          />
        </dl>
      </section>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
