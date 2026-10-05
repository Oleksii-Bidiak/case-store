"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Clock } from "lucide-react";
import {
  OrderItemThumb,
  OrderStatusBadge,
  OrderTrackingNumber,
  type OrderEntity,
} from "@/entities/order";
import { CancelOrderButton } from "@/features/cancel-order";
import {
  retryHandoffMessage,
  useOrderPayment,
  type PaymentStartFailure,
} from "@/features/checkout";
import { ReturnRequestButton } from "@/features/return-request";
import { dict } from "@/shared/config";
import { formatDate, formatMoney } from "@/shared/lib";
import { Badge, Button } from "@/shared/ui";
import { orderUnitCount, thumbStrip } from "../model/order-history-params";
import { ORDER_CARD_CLASS } from "./order-card-class";

/** Existing Badge variants only; «Кошти повернено» is the solid success one. */
const RETURN_BADGE_VARIANT: Record<
  string,
  "secondary" | "success" | "outline"
> = {
  REFUNDED: "success",
  REJECTED: "outline",
};

/** The newest return request's status (TASK-608), named by an sr-only prefix. */
function ReturnStatusBadge({ status }: { status: string | undefined }) {
  if (!status) return null;
  const label = dict.returnRequest.statusLabels[status] ?? status;
  return (
    <Badge
      variant={RETURN_BADGE_VARIANT[status] ?? "secondary"}
      data-return-status={status}
    >
      <span className="sr-only">{`${dict.returnRequest.statusSr}: `}</span>
      {label}
    </Badge>
  );
}

/**
 * One size for every card action (AccountOrders.dc.html `.ao-btn`): 44px tall,
 * the 13px CTA radius, 18px side padding even with a trailing chevron.
 */
const ACTION_CLASS = "h-11 rounded-cta px-4.5 font-semibold has-[>svg]:px-4.5";

const THUMB_CLASS = "size-13 rounded-menu";

interface OrderCardProps {
  order: OrderEntity;
  /** Status of the order's newest return request, if any (TASK-608). */
  returnStatus?: string;
  /**
   * Minutes left to pay before the reservation lapses; `0` = the order is not
   * awaiting an online payment (see `awaitingPaymentMinutes`). Computed by
   * the list from one shared clock, so every card ticks together.
   */
  awaitingMinutes: number;
}

/**
 * OrderCard — one order in `/account/orders` (TASK-217, AccountOrders.dc.html):
 *
 * 1. number (→ the order detail), date · units; status, payment and return
 *    pills on the right;
 * 2. up to four thumbnails + «+N» (three below `sm`), «Разом» + total;
 * 3. a SHIPPED order's ТТН with copy/track, or an unpaid online order's
 *    «Очікує оплати · N хв» note;
 * 4. actions — stacked full-width below `sm`, right-aligned from it. At most
 *    one is primary: «Оплатити», only while the payment note shows.
 */
export function OrderCard({
  order,
  returnStatus,
  awaitingMinutes,
}: OrderCardProps) {
  const ref = order.id.slice(0, 8).toUpperCase();
  const headingId = `order-${order.id}-title`;
  const href = `/account/orders/${order.id}`;
  const total = formatMoney(order.total);
  const awaiting = awaitingMinutes > 0;
  const strip = thumbStrip(order.items);

  const { startPayment, isStarting } = useOrderPayment();
  const [payFailure, setPayFailure] = useState<PaymentStartFailure | null>(
    null,
  );

  const pay = async () => {
    setPayFailure(null);
    // The same handoff as the confirmation page's retry: a NEW payment
    // attempt each time. On success the browser is already leaving.
    const reason = await startPayment(order.id);
    if (reason) setPayFailure(reason);
  };

  return (
    <article aria-labelledby={headingId} className={ORDER_CARD_CLASS}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5">
        <div className="min-w-0">
          <h2
            id={headingId}
            className="text-base font-semibold text-foreground"
          >
            <Link
              href={href}
              className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {dict.account.dashboard.orderHeading(ref)}
            </Link>
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatDate(order.createdAt)} ·{" "}
            {dict.orderHistory.itemCount(orderUnitCount(order.items))}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <OrderStatusBadge
            status={order.status}
            srLabel={dict.orderHistory.statusSr}
          >
            {dict.order.orderStatusLabels[order.status] ?? order.status}
          </OrderStatusBadge>
          {/* «Оплата: …» names itself — no sr prefix needed. */}
          <OrderStatusBadge status={order.paymentStatus}>
            {dict.order.paymentLabel(order.paymentStatus)}
          </OrderStatusBadge>
          <ReturnStatusBadge status={returnStatus} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div aria-hidden="true" className="flex gap-2">
          {strip.shown.map((item, index) => (
            <span
              key={item.id}
              data-testid="order-thumb"
              className={
                strip.narrowHidesLast && index === strip.shown.length - 1
                  ? "hidden sm:block"
                  : "block"
              }
            >
              <OrderItemThumb
                productName={item.productName}
                imageUrl={item.imageUrl}
                className={THUMB_CLASS}
              />
            </span>
          ))}
          {/* «+N» counts the lines NOT pictured at each width. Foreground, not
              muted: muted text on the muted tile is 4.34:1. */}
          {strip.moreNarrow > 0 && (
            <span
              data-testid="order-thumbs-more-narrow"
              className={`inline-flex items-center justify-center bg-muted text-sm font-semibold text-foreground sm:hidden ${THUMB_CLASS}`}
            >
              +{strip.moreNarrow}
            </span>
          )}
          {strip.moreWide > 0 && (
            <span
              data-testid="order-thumbs-more-wide"
              className={`hidden items-center justify-center bg-muted text-sm font-semibold text-foreground sm:inline-flex ${THUMB_CLASS}`}
            >
              +{strip.moreWide}
            </span>
          )}
        </div>
        <p className="sr-only">
          {order.items.map((item) => item.productName).join(", ")}
        </p>

        <p className="shrink-0 text-right whitespace-nowrap">
          <span className="block text-xs text-muted-foreground">
            {dict.orderHistory.total}
          </span>
          <span className="font-display text-xl font-bold text-foreground">
            {total}
          </span>
        </p>
      </div>

      {order.status === "SHIPPED" && order.trackingNumber ? (
        <OrderTrackingNumber trackingNumber={order.trackingNumber} />
      ) : null}

      {awaiting && (
        // Foreground text on the warning tint: muted-foreground there is ≈4.2:1.
        <div
          data-testid="order-awaiting-payment"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-menu bg-warning/15 px-3.5 py-2.5 text-sm text-foreground"
        >
          <Clock className="size-4.5 shrink-0" aria-hidden="true" />
          <b className="font-semibold">
            {dict.orderHistory.awaitingPayment(awaitingMinutes)}
          </b>
          <span>{dict.orderHistory.awaitingPaymentNote}</span>
        </div>
      )}

      <div className="grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
        {awaiting && (
          <Button
            type="button"
            onClick={() => void pay()}
            disabled={isStarting}
            className={ACTION_CLASS}
          >
            {isStarting
              ? dict.order.payment.retrying
              : dict.orderHistory.pay(total)}
          </Button>
        )}

        {order.status === "PENDING" && (
          <CancelOrderButton orderId={order.id} className={ACTION_CLASS} />
        )}

        {/* TASK-373. DELIVERED only, and not SHIPPED, even though the API
            accepts both: a parcel still in transit is not something to file a
            return about. A refusal at the counter comes back as an undelivered
            parcel, which is an operator's job, not a form's. */}
        {order.status === "DELIVERED" && (
          <ReturnRequestButton
            orderId={order.id}
            orderNumber={`#${ref}`}
            items={order.items}
            className={ACTION_CLASS}
          />
        )}

        <Button asChild variant="outline" className={ACTION_CLASS}>
          <Link href={href} aria-label={dict.orderHistory.viewAria(ref)}>
            {dict.orderHistory.view}
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>

      {payFailure && (
        <p role="alert" className="text-sm text-destructive">
          {retryHandoffMessage(payFailure)}
        </p>
      )}
    </article>
  );
}
