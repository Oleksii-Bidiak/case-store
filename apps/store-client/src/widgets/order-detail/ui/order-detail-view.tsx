"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useAuth } from "@/entities/session";
import {
  OrderStatusBadge,
  OrderTotalsBreakdown,
  awaitingPaymentMinutes,
  orderDeliveryDetails,
  orderTimelineIndex,
  useGetOrder,
  useNow,
  type OrderEntity,
} from "@/entities/order";
import { CancelOrderButton } from "@/features/cancel-order";
import {
  OrderPaymentPanel,
  paymentMethodTitle,
  useForgetSettledPaymentAttempt,
  usePaymentAttemptWatch,
  type PaymentAttemptWatch,
} from "@/features/checkout";
import { ReturnRequestButton } from "@/features/return-request";
import { dict, H1_CLASS, STICKY_ASIDE_TOP } from "@/shared/config";
import { formatDate, formatMoney, formatTime } from "@/shared/lib";
import { Button } from "@/shared/ui";
import {
  DETAIL_CARD_CLASS,
  OrderDetailDelivery,
  OrderDetailItems,
  OrderDetailNotes,
} from "./order-detail-sections";
import { OrderDetailSkeleton } from "./order-detail-skeleton";
import { OrderClosedStrip, OrderStatusTimeline } from "./order-status-timeline";

export const ACCOUNT_ORDERS_HREF = "/account/orders";

/** AccountOrders.dc.html `.ao-btn`, full width in the summary column. */
const ACTION_CLASS = "h-11 w-full rounded-cta px-4.5 font-semibold";

/** The one primary of the not-found / error card — sized to its label. */
const MESSAGE_CTA_CLASS = "h-11 rounded-cta px-4.5 font-semibold";

/** The not-found / error card (`.ao-box`, left-aligned). */
const MESSAGE_CARD_CLASS =
  "flex flex-col items-start gap-3.5 rounded-card border border-border bg-card p-6 shadow-card sm:p-8";

/** «← Історія замовлень» — a 44px hit area on a 20px text line. */
function BackLink() {
  return (
    <Link
      href={ACCOUNT_ORDERS_HREF}
      className="-my-3 inline-flex items-center gap-2 self-start rounded-sm py-3 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronLeft className="size-4.5" aria-hidden="true" />
      {dict.account.dashboard.nav.orders}
    </Link>
  );
}

/**
 * OrderDetailView — one order inside the account, `/account/orders/[id]`
 * (TASK-217, AccountOrders.dc.html `#detail`).
 *
 * Top to bottom: «← Історія замовлень»; the h1 «Замовлення #7F3A91C2» with the
 * date and the status / payment pills; the four-stage timeline (or, for a
 * closed order, a strip); the payment panel; then from `xl` two columns —
 * items, delivery and notes on the left, the sticky summary with the one or two
 * order actions on the right — stacked below `xl`.
 *
 * No auth guard of its own: AccountShell (the account layout) does not mount a
 * route until the session is there. The payment-callback wait is the same hook
 * as the confirmation page's — a shopper sent back here from the bank sees
 * «Підтверджуємо вашу оплату» and the page polls until the money settles. The
 * `purchase` analytics event belongs to the confirmation page alone: this one
 * is visited again and again and must not count sales.
 */
export function OrderDetailView({ orderId }: { orderId: string }) {
  const { isAuthenticated } = useAuth();
  const watch = usePaymentAttemptWatch(orderId);

  const { data, isLoading, isError, error, refetch } = useGetOrder(orderId, {
    query: {
      enabled: isAuthenticated,
      refetchInterval: watch.refetchInterval,
    },
  });

  useForgetSettledPaymentAttempt(orderId, data?.data?.paymentStatus);

  const order = data?.data;
  // The countdown clock runs only while the order can still be paid online.
  const now = useNow(
    !!order &&
      order.paymentMethod !== "ON_DELIVERY" &&
      order.paymentStatus === "PENDING" &&
      order.status === "PENDING",
  );

  if (!isAuthenticated || isLoading) {
    return <OrderDetailSkeleton />;
  }

  const status = error?.response?.status;

  // A non-404 failure (network blip, 5xx) is transient, not a missing order.
  if (isError && status !== 404) {
    return (
      <div className="flex flex-col gap-5">
        <BackLink />
        <div role="alert" className={MESSAGE_CARD_CLASS}>
          <h1 className={`${H1_CLASS} text-foreground`}>
            {dict.order.somethingWrong}
          </h1>
          <p className="text-muted-foreground">{dict.order.loadErrorBody}</p>
          <Button
            type="button"
            onClick={() => void refetch()}
            className={MESSAGE_CTA_CLASS}
          >
            {dict.common.tryAgain}
          </Button>
        </div>
      </div>
    );
  }

  // 404 — no such order, or another account's (the API does not say which).
  if (!order) {
    return (
      <div className="flex flex-col gap-5">
        <BackLink />
        <div role="alert" className={MESSAGE_CARD_CLASS}>
          <h1 className={`${H1_CLASS} text-foreground`}>
            {dict.order.notFoundHeading}
          </h1>
          <p className="text-muted-foreground">{dict.order.notFoundBody}</p>
          <Button asChild className={MESSAGE_CTA_CLASS}>
            <Link href={ACCOUNT_ORDERS_HREF}>
              {dict.order.detail.backToList}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return <OrderDetailContent order={order} watch={watch} now={now} />;
}

function OrderDetailContent({
  order,
  watch,
  now,
}: {
  order: OrderEntity;
  watch: PaymentAttemptWatch;
  now: number;
}) {
  const ref = order.id.slice(0, 8).toUpperCase();
  const placedOn = formatDate(order.createdAt);
  const open = orderTimelineIndex(order.status) !== null;
  // `notes` is generated loosely; narrow to a display string.
  const notes = typeof order.notes === "string" && order.notes.trim();

  // Cash on delivery: nothing to say about money online (AccountOrders.dc.html).
  const showPanel = order.paymentMethod !== "ON_DELIVERY";
  // When the panel itself says «Замовлення скасовано», the strip would repeat
  // it word for word — the panel's body already explains, so the strip goes.
  const panelSaysCancelled =
    showPanel &&
    !open &&
    order.paymentStatus !== "PAID" &&
    order.paymentStatus !== "REFUNDED";

  const canCancel = order.status === "PENDING";
  // TASK-373: DELIVERED only, though the API accepts SHIPPED too — a parcel
  // still in transit is not something to file a return about.
  const canReturn = order.status === "DELIVERED";

  return (
    <div className="flex flex-col gap-5">
      <BackLink />

      <header className="flex flex-col gap-2.5">
        <h1 className={`${H1_CLASS} text-foreground`}>
          {dict.account.dashboard.orderHeading(ref)}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm text-muted-foreground">
            {dict.order.detail.placedOn(placedOn)}
          </span>
          <OrderStatusBadge
            status={order.status}
            srLabel={dict.order.orderStatusSr}
          >
            {dict.order.orderStatusLabels[order.status] ?? order.status}
          </OrderStatusBadge>
          {/* «Оплата: …» names itself — no sr prefix needed. */}
          <OrderStatusBadge status={order.paymentStatus}>
            {dict.order.paymentLabel(order.paymentStatus)}
          </OrderStatusBadge>
        </div>
      </header>

      {open ? (
        <OrderStatusTimeline status={order.status} placedOn={placedOn} />
      ) : (
        !panelSaysCancelled && (
          <OrderClosedStrip status={order.status} placedOn={placedOn} />
        )
      )}

      {showPanel && (
        <OrderPaymentPanel
          orderId={order.id}
          paymentStatus={order.paymentStatus}
          orderStatus={order.status}
          hasRecentAttempt={watch.hasRecentAttempt}
          isAwaitingCallback={watch.isAwaitingCallback}
          awaiting={{
            minutes: awaitingPaymentMinutes(order, now),
            until: order.reservationExpiresAt
              ? formatTime(order.reservationExpiresAt)
              : "",
            total: formatMoney(order.total),
          }}
        />
      )}

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-col gap-5 xl:flex-1">
          <OrderDetailItems items={order.items} />
          <OrderDetailDelivery order={order} />
          {notes && <OrderDetailNotes notes={notes} />}
        </div>

        <aside
          className={`flex flex-col gap-4 xl:w-80 xl:shrink-0 xl:sticky ${STICKY_ASIDE_TOP}`}
        >
          <OrderTotalsBreakdown
            subtotal={order.subtotal}
            addonsTotal={order.addonsTotal}
            discount={order.discount}
            discountCode={order.discountCode}
            shippingCost={order.shippingCost}
            shippingPending={orderDeliveryDetails(order).shippingCostPending}
            tax={order.tax}
            total={order.total}
            className={DETAIL_CARD_CLASS}
          >
            {/* Foreground label: muted text on `bg-muted` is 4.34:1. */}
            <dl className="flex items-center justify-between gap-3 rounded-menu bg-muted px-3 py-2.5 text-sm text-foreground">
              <dt>{dict.order.paymentMethodLabel}</dt>
              <dd className="font-medium">
                {paymentMethodTitle(order.paymentMethod)}
              </dd>
            </dl>
          </OrderTotalsBreakdown>

          {(canCancel || canReturn) && (
            <div className="flex flex-col gap-2">
              {canCancel && (
                <CancelOrderButton
                  orderId={order.id}
                  className={ACTION_CLASS}
                />
              )}
              {canReturn && (
                <ReturnRequestButton
                  orderId={order.id}
                  orderNumber={`#${ref}`}
                  items={order.items}
                  className={ACTION_CLASS}
                />
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
