import type { ReactNode } from "react";
import {
  OrderItemRow,
  OrderTrackingNumber,
  orderDeliveryDetails,
  orderUnitCount,
  type OrderEntity,
} from "@/entities/order";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

/**
 * The detail's content card (AccountOrders.dc.html `.ao-sec`): the 18px card
 * radius, 20px padding, the resting card shadow.
 */
export const DETAIL_CARD_CLASS =
  "rounded-card border border-border bg-card p-5 text-card-foreground shadow-card";

function DetailCard({
  title,
  testId,
  children,
  titleClassName = "mb-3.5",
}: {
  title: ReactNode;
  testId: string;
  children: ReactNode;
  titleClassName?: string;
}) {
  return (
    <section data-testid={testId} className={DETAIL_CARD_CLASS}>
      <h2
        className={cn("text-lg font-semibold text-foreground", titleClassName)}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

/** «Замовлені товари · 5 товарів» — the lines with their add-ons. */
export function OrderDetailItems({ items }: { items: OrderEntity["items"] }) {
  return (
    <DetailCard
      testId="order-detail-items"
      title={
        <>
          {dict.order.itemsOrdered}{" "}
          <span className="font-normal text-muted-foreground">
            · {dict.orderHistory.itemCount(orderUnitCount(items))}
          </span>
        </>
      }
    >
      <ul className="flex flex-col">
        {items.map((item) => (
          <OrderItemRow key={item.id} item={item} />
        ))}
      </ul>
    </DetailCard>
  );
}

function DeliveryRow({
  term,
  children,
}: {
  term: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <dt className="w-27.5 shrink-0 text-muted-foreground">{term}</dt>
      <dd className="min-w-0 flex-1 text-foreground">{children}</dd>
    </div>
  );
}

/**
 * «Доставка» — how, to whom, where, and the waybill (AccountOrders.dc.html):
 * a two-column `dl` with a 110px label column at every width. Rows the
 * snapshot has nothing for are left out rather than printed empty. The «ТТН»
 * row is for a Nova Poshta parcel (or any order an operator gave a waybill):
 * the number with copy / track, or «Ще не передано перевізнику».
 */
export function OrderDetailDelivery({ order }: { order: OrderEntity }) {
  const t = dict.order.detail;
  const delivery = orderDeliveryDetails(order);
  const placeTerm = delivery.place
    ? {
        warehouse: t.deliveryWarehouse,
        pickup: t.deliveryPickupPoint,
        address: t.deliveryAddress,
      }[delivery.place.kind]
    : null;
  const showTracking =
    order.deliveryMethod === "NOVA_POSHTA" || !!order.trackingNumber;

  return (
    <DetailCard testId="order-detail-delivery" title={t.deliveryHeading}>
      <dl className="flex flex-col gap-2.5 text-sm">
        <DeliveryRow term={t.deliveryMethod}>
          {t.deliveryMethods[order.deliveryMethod] ?? order.deliveryMethod}
        </DeliveryRow>
        {(delivery.recipient || delivery.phone) && (
          <DeliveryRow term={t.deliveryRecipient}>
            {delivery.recipient && (
              <span className="block">{delivery.recipient}</span>
            )}
            {delivery.phone && (
              <span className="block font-mono text-muted-foreground">
                {delivery.phone}
              </span>
            )}
          </DeliveryRow>
        )}
        {delivery.city && (
          <DeliveryRow term={t.deliveryCity}>{delivery.city}</DeliveryRow>
        )}
        {delivery.place && placeTerm && (
          <DeliveryRow term={placeTerm}>{delivery.place.value}</DeliveryRow>
        )}
        {showTracking && (
          <DeliveryRow term={t.deliveryTracking}>
            {order.trackingNumber ? (
              <OrderTrackingNumber
                trackingNumber={order.trackingNumber}
                variant="inline"
              />
            ) : (
              <span className="text-muted-foreground">{t.trackingNone}</span>
            )}
          </DeliveryRow>
        )}
      </dl>
    </DetailCard>
  );
}

/** «Примітки» — what the customer typed at checkout. */
export function OrderDetailNotes({ notes }: { notes: string }) {
  return (
    <DetailCard
      testId="order-detail-notes"
      title={dict.order.notesTitle}
      titleClassName="mb-2"
    >
      <p className="text-sm whitespace-pre-line text-foreground">{notes}</p>
    </DetailCard>
  );
}
