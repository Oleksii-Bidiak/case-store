"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CopyIcon } from "lucide-react";
import {
  formatOrderNumber,
  isPreShipmentStatus,
  isShippingCostPending,
  OrderEntityPaymentStatus,
  orderDerivedMarks,
  orderStatusBadgeVariant,
  orderStatusLabel,
  paymentStatusBadgeVariant,
  paymentStatusLabel,
  useAdminOrderControllerFindById,
  useAdminOrderControllerGetHistory,
  type OrderEntity,
} from "@/entities/order";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { OrderStatusSelect } from "@/features/order-status-update";
import { PaymentStatusSelect } from "@/features/order-payment-update";
// TASK-484: "give the buyer a link to their own order" — a mutation with its own
// one-shot state, so it lives in features, not here.
import { OrderAccessLinkCard } from "@/features/order-access-link";
import {
  Badge,
  Button,
  RowActionsMenu,
  Separator,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type RowActionItem,
} from "@/shared/ui";
import { toast } from "@/shared/ui/toast";
import { dict } from "@/shared/config";
import {
  formatCurrency,
  formatDateTime,
  formatTime,
  formatUAPhone,
  isValidUAPhone,
} from "@/shared/lib";
import { OPERATIONAL_LIST_QUERY } from "@/shared/lib/query-freshness";
import { useNow } from "@/shared/lib/use-now";
import { orderPath } from "../model/order-path";
import { OrderDeliverySection } from "./order-delivery-section";
import { OrderDetailSkeleton } from "./order-detail-skeleton";
import { OrderPaymentAttempts } from "./order-payment-attempts";
import { OrderReturnsSection } from "./order-returns-section";
import { OrderTimeline } from "./order-timeline";

const d = dict.orders;

/** How often the open card re-reads its order (TASK-629). */
const ORDER_REFETCH_MS = 60_000;
/** The «Очікує оплати · N хв» count is in minutes — tick once a minute. */
const MARK_TICK_MS = 60_000;

const card = "flex flex-col gap-3 rounded-lg border border-border p-4";

interface OrderDetailViewProps {
  orderId: string;
}

interface AddressFields {
  firstName?: string;
  lastName?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
}

const phoneText = (raw: string) =>
  isValidUAPhone(raw) ? formatUAPhone(raw) : raw;

function copyNumber(order: OrderEntity) {
  const number = formatOrderNumber(order.id);
  const write = navigator.clipboard?.writeText(number);
  if (!write) {
    toast.error(d.copyFailed);
    return;
  }
  write.then(
    () => toast.success(d.copiedNumber(number)),
    () => toast.error(d.copyFailed),
  );
}

/**
 * The order card (wave 198, TASK-1046, OrdersProposal К1–К4).
 *
 * Header: «← Замовлення», the number in mono with «Скопіювати номер», the
 * status / payment / stock badges and the derived marks, then the actions —
 * «Змінити статус ▾» (the server's legal moves, the unavailable ones with a
 * reason), the natural next step as the primary button, «⋯». Below: the order
 * path, then two columns from lg (positions + totals, payment, history | client,
 * delivery and operator data, customer note, returns, buyer link); one column
 * on a phone.
 *
 * Nothing that was on the card is gone, and every control keeps its gate:
 * without `orders:write` the status menu, the payment picker, the address edit
 * and the details form are ABSENT (TASK-715), and one line says so.
 *
 * Address and ТТН/notes still save separately — two forms in one card, each with
 * its own lock token and 409 handling. One «Зберегти» for both is TASK-994: the
 * API can take them in one PATCH (TASK-786), but merging two RHF forms with
 * their own dirty/lock state is a change of its own, not a relayout.
 */
export function OrderDetailView({ orderId }: OrderDetailViewProps) {
  const router = useRouter();
  const { can, arePermissionsLoading } = useAuth();
  // Two answers, not one boolean negated: until the grant set arrives neither is
  // true, so the card renders neither the controls nor the «view only» line.
  const canWriteOrders = !arePermissionsLoading && can(PERM.ordersWrite);
  const isReadOnly = !arePermissionsLoading && !can(PERM.ordersWrite);
  // TASK-629: the card is a working surface — operational freshness plus a
  // one-minute poll. Both forms seed through RHF `values` + `keepDirtyValues`
  // and hold the lock token of the version being edited (`useEditLockToken`).
  const { data, dataUpdatedAt, isLoading, isError, error } =
    useAdminOrderControllerFindById(orderId, {
      query: { ...OPERATIONAL_LIST_QUERY, refetchInterval: ORDER_REFETCH_MS },
    });
  // The same history the timeline reads (one cache entry): the order path
  // takes its timestamps from it.
  const history = useAdminOrderControllerGetHistory(orderId);
  // The minute count moves between refetches too: a pure tick combined with the
  // fetch instant, never `Date.now()` in render (see `useNow`).
  const tick = useNow(MARK_TICK_MS);
  const marksNow = Math.max(dataUpdatedAt, tick ?? 0);

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/orders");
    }
  }, [isNotFound, router]);

  if (isLoading) {
    return <OrderDetailSkeleton />;
  }

  if (isError && !isNotFound) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {d.loadOneError}
      </p>
    );
  }

  const order = data?.data;
  if (!order) {
    return null;
  }

  const shipping = (order.shippingAddress ?? null) as AddressFields | null;
  const billing = (order.billingAddress ?? null) as AddressFields | null;
  const billingDiffers =
    billing && JSON.stringify(billing) !== JSON.stringify(shipping);

  // TASK-425: the add-ons are inside `total` and in none of the line rows.
  const hasAddons = order.items.some((item) => (item.addons?.length ?? 0) > 0);
  const addonsTotal = Number(order.addonsTotal ?? 0);

  // Stock-hold badges (TASK-254).
  const holdsStock =
    isPreShipmentStatus(order.status) && order.restockedAt == null;
  const heldQuantity = holdsStock
    ? order.items.reduce((sum, item) => sum + item.quantity, 0)
    : 0;

  const heading = d.title(formatOrderNumber(order.id).slice(1));
  const hashAt = heading.lastIndexOf("#");

  // «⋯ Інші дії» — only what exists today. The buyer link is issued for guest
  // orders only (TASK-623), so the shortcut is offered only there.
  const moreActions: RowActionItem[] = order.userId
    ? []
    : [{ label: d.accessLinkAction, href: "#order-access-link" }];
  const more = moreActions.length ? (
    <RowActionsMenu label={d.moreActionsAria} items={moreActions} />
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/orders"
        className="self-start rounded-xs text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {d.back}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {heading.slice(0, hashAt)}
              <span className="font-mono tracking-wide">
                {heading.slice(hashAt)}
              </span>
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={d.rowCopyNumber}
              title={d.rowCopyNumber}
              className="text-muted-foreground"
              onClick={() => copyNumber(order)}
            >
              <CopyIcon aria-hidden="true" />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={orderStatusBadgeVariant(order.status)}>
              {orderStatusLabel(order.status)}
            </Badge>
            <Badge variant={paymentStatusBadgeVariant(order.paymentStatus)}>
              {paymentStatusLabel(order.paymentStatus)}
            </Badge>
            {holdsStock ? (
              <Badge variant="warning">{d.holdsStock(heldQuantity)}</Badge>
            ) : order.restockedAt != null ? (
              <Badge variant="secondary">
                {d.restockedAt(formatTime(order.restockedAt))}
              </Badge>
            ) : null}
            {/* TASK-470 / 471 / 472: the derived marks of B-1, by the same
                function the LIST uses; the clock is the fetch instant advanced
                by a one-minute tick (TASK-629), never `Date.now()` in render. */}
            {orderDerivedMarks(order, marksNow).map((mark) => (
              <Badge key={mark.kind} variant={mark.variant}>
                {mark.label}
              </Badge>
            ))}
            <span className="text-xs text-muted-foreground">
              {d.timeline(
                formatDateTime(order.createdAt),
                formatDateTime(order.updatedAt),
              )}
            </span>
          </div>
        </div>

        {/* `#order-status`: the list's «⋯ → Змінити статус…» lands here. */}
        <div
          id="order-status"
          className="flex scroll-mt-20 flex-col items-start gap-2 lg:items-end"
        >
          {canWriteOrders ? (
            // TASK-332: the control takes only the id — the legal moves AND the
            // lock token come from the server.
            <OrderStatusSelect orderId={order.id} trailing={more} />
          ) : isReadOnly ? (
            <div className="flex flex-wrap items-center gap-2">
              {/* TASK-715: the absence is deliberate, and says so. */}
              <p className="text-sm text-muted-foreground">
                {dict.common.viewOnly}
              </p>
              {more}
            </div>
          ) : null}
        </div>
      </div>

      <Stepper
        aria-label={d.stepsAria}
        steps={orderPath(order, history.data?.data)}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <section className="flex flex-col overflow-hidden rounded-lg border border-border">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground">
                {d.itemsHeading}
              </h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{d.itemProduct}</TableHead>
                  <TableHead hideOnMobile className="text-right">
                    {d.itemUnitPrice}
                  </TableHead>
                  <TableHead hideOnMobile className="text-right">
                    {d.itemQty}
                  </TableHead>
                  <TableHead className="text-right">
                    {d.itemLineTotal}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/products/${item.productId}/edit`}
                          aria-label={d.viewProductAria(item.productName)}
                          className="font-medium text-primary hover:underline"
                        >
                          {item.productName}
                        </Link>
                        {/* TASK-470: a LINE mark — the server names the
                              lines (`unavailableItemIds`); absent means "not
                              measured", so `?.` renders nothing. */}
                        {order.unavailableItemIds?.includes(item.id) ? (
                          <Badge
                            variant="destructive"
                            title={d.markItemUnavailableHint}
                          >
                            {d.markItemUnavailable}
                          </Badge>
                        ) : null}
                      </div>
                      {/* TASK-425: the add-ons bought with this line, under
                            its name (К1) — NOT folded into the line sum:
                            `lineTotal` excludes them, `addonsTotal` holds them. */}
                      {item.addons?.map((addon) => (
                        <span
                          key={addon.id}
                          className="block text-xs text-muted-foreground"
                        >
                          + {addon.name} · {formatCurrency(addon.price)}
                        </span>
                      ))}
                      {/* Below md the price and quantity columns fold into
                            one line under the name (К4). */}
                      <span className="text-xs text-muted-foreground md:hidden">
                        {item.quantity} × {formatCurrency(item.price)}
                      </span>
                    </TableCell>
                    <TableCell hideOnMobile className="text-right">
                      {formatCurrency(item.price)}
                    </TableCell>
                    <TableCell hideOnMobile className="text-right">
                      {item.quantity}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(item.lineTotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div
              role="group"
              aria-label={d.summary}
              className="flex flex-col gap-1.5 border-t px-4 py-3"
            >
              <SummaryRow
                label={d.subtotal}
                value={formatCurrency(order.subtotal)}
              />
              {/* TASK-425: the missing row — hidden at zero. */}
              {addonsTotal > 0 ? (
                <SummaryRow
                  label={d.addonsTotal}
                  value={formatCurrency(order.addonsTotal)}
                />
              ) : null}
              {/* TASK-425: a discount with no code cannot be explained. */}
              <SummaryRow
                label={
                  order.discountCode
                    ? d.discountWithCode(order.discountCode)
                    : d.discount
                }
                value={formatCurrency(order.discount)}
              />
              {/* TASK-648: an OTHER order's 0 is a placeholder, not free; a
                  booked cost is shown as booked — «Разом» includes it. */}
              <SummaryRow
                label={d.shipping}
                value={
                  isShippingCostPending(order)
                    ? d.deliveryCostNotCalculated
                    : formatCurrency(order.shippingCost)
                }
              />
              <SummaryRow label={d.tax} value={formatCurrency(order.tax)} />
              <Separator className="my-1" />
              <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                <span>{d.total}</span>
                <span className="tabular-nums">
                  {formatCurrency(order.total)}
                </span>
              </div>
            </div>
            {/* TASK-341: no "edit lines" control, and this says so. */}
            <div className="flex flex-col gap-1 border-t px-4 py-3">
              {hasAddons ? (
                <p className="text-xs text-muted-foreground">{d.addonsHint}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {d.itemsLockedHint}
              </p>
            </div>
          </section>

          {/* TASK-330-C: everything about money for this order in one card. */}
          <section className={card}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                {d.paymentHeading}
              </h3>
              <Badge variant={paymentStatusBadgeVariant(order.paymentStatus)}>
                {paymentStatusLabel(order.paymentStatus)}
              </Badge>
            </div>
            <SummaryRow
              label={d.paymentAmountLabel}
              value={formatCurrency(order.total)}
            />
            {/* TASK-472: "Повернуто X з Y" — only at PARTIALLY_REFUNDED, and
                only when the response carried the sum. */}
            {order.paymentStatus ===
              OrderEntityPaymentStatus.PARTIALLY_REFUNDED &&
            order.refundedTotal != null ? (
              <SummaryRow
                label={d.refundedLabel}
                value={d.refundedOfTotal(
                  formatCurrency(order.refundedTotal),
                  formatCurrency(order.total),
                )}
              />
            ) : null}
            {/* TASK-715: the payment control needs `orders:write` (it renders
                nothing otherwise); on unpaid cash on delivery it leads with
                «Гроші від НП отримано» — the same move to PAID (К1). */}
            {canWriteOrders ? (
              <>
                <Separator />
                <PaymentStatusSelect
                  orderId={order.id}
                  paymentMethod={order.paymentMethod}
                  total={order.total}
                />
              </>
            ) : null}
            {/* TASK-371: the LiqPay attempts and «Повернути кошти». */}
            <OrderPaymentAttempts order={order} />
          </section>

          {/* TASK-251: the status / payment / waybill history. */}
          <section className={card}>
            <h3 className="text-sm font-semibold text-foreground">
              {d.timelineHeading}
            </h3>
            <OrderTimeline orderId={order.id} customerUserId={order.userId} />
          </section>
        </div>

        {/* Side column */}
        <div className="flex min-w-0 flex-col gap-6">
          <CustomerCard order={order} />

          {/* «Доставка» (TASK-648, ДН-1.13): one block for the four methods,
              with the address correction, the waybill and the internal notes
              — two forms, one card, as before. */}
          <OrderDeliverySection order={order} />

          {order.notes ? (
            // TASK-336: the CUSTOMER's own note, read-only and labelled as such.
            <section className={card}>
              <h3 className="text-sm font-semibold text-foreground">
                {d.notes}
              </h3>
              <p className="text-sm whitespace-pre-wrap text-foreground">
                {order.notes}
              </p>
              <p className="text-xs text-muted-foreground">
                {d.customerNotesHint}
              </p>
            </section>
          ) : null}

          {/* TASK-724: the order's return requests (absent without
              `returns:read`). */}
          <OrderReturnsSection orderId={order.id} orderUserId={order.userId} />

          {/* TASK-484 / 623: the buyer's link — guest orders only. */}
          <div id="order-access-link" className="scroll-mt-20">
            <OrderAccessLinkCard orderId={orderId} userId={order.userId} />
          </div>

          {billingDiffers ? (
            <section className={card}>
              <h3 className="text-sm font-semibold text-foreground">
                {d.billingAddress}
              </h3>
              <AddressLines address={billing} />
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * «Клієнт» + «Гість»/«Акаунт» (TASK-425): name, phone and email, each line only
 * when the order has it — an operator's phone order carries no email
 * (TASK-426), and an empty row there read as a broken card.
 *
 * «N замовлень · сума · Усі →» of the artboard needs an aggregate the API does
 * not have (TASK-1046's API tail), so it is not drawn.
 */
function CustomerCard({ order }: { order: OrderEntity }) {
  if (!order.customer && !order.guest) return null;
  const guest = !order.customer;
  const name = order.customer
    ? [order.customer.firstName, order.customer.lastName]
        .filter(Boolean)
        .join(" ")
    : (order.guest?.name ?? "");
  const phone = order.customer ? null : (order.guest?.phone ?? null);
  const email = order.customer
    ? order.customer.email
    : (order.guest?.email ?? null);

  return (
    <section className={card}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{d.customer}</h3>
        <Badge variant={guest ? "warning" : "secondary"}>
          {guest ? d.customerTypeGuest : d.customerTypeAccount}
        </Badge>
      </div>
      <div className="flex flex-col gap-1 text-sm">
        {name ? <span className="text-foreground">{name}</span> : null}
        {phone ? (
          <a
            href={`tel:+${phone.replace(/\D/g, "")}`}
            className="self-start rounded-xs text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {phoneText(phone)}
          </a>
        ) : null}
        {email ? (
          <a
            href={`mailto:${email}`}
            className="self-start rounded-xs break-all text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {email}
          </a>
        ) : null}
      </div>
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>{label}</span>
      <span className="text-right text-foreground tabular-nums">{value}</span>
    </div>
  );
}

/** The address itself, without a card around it. */
function AddressLines({ address }: { address: AddressFields | null }) {
  if (!address) {
    return null;
  }

  const name = [address.firstName, address.lastName].filter(Boolean).join(" ");
  const cityLine = [address.city, address.state, address.postalCode]
    .filter(Boolean)
    .join(", ");

  return (
    <address className="text-sm text-foreground not-italic">
      {name ? <div>{name}</div> : null}
      {address.company ? <div>{address.company}</div> : null}
      {address.address1 ? <div>{address.address1}</div> : null}
      {address.address2 ? <div>{address.address2}</div> : null}
      {cityLine ? <div>{cityLine}</div> : null}
      {address.country ? <div>{address.country}</div> : null}
      {address.phone ? <div>{address.phone}</div> : null}
    </address>
  );
}
