"use client";

import { Fragment, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  isPreShipmentStatus,
  OrderEntityPaymentStatus,
  orderDerivedMarks,
  orderStatusBadgeVariant,
  orderStatusLabel,
  paymentStatusBadgeVariant,
  paymentStatusLabel,
  useAdminOrderControllerFindById,
} from "@/entities/order";
import { OrderStatusSelect } from "@/features/order-status-update";
import { PaymentStatusSelect } from "@/features/order-payment-update";
import { OrderDetailsForm } from "@/features/order-details-form";
// TASK-484: "give the buyer a link to their own order" — a mutation with its own
// one-shot state, so it lives in features, not here.
import { OrderAccessLinkCard } from "@/features/order-access-link";
import { OrderAddressForm } from "@/features/order-address-edit";
import {
  Badge,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatCurrency, formatDateTime, formatTime } from "@/shared/lib";
import { OrderDetailSkeleton } from "./order-detail-skeleton";
import { OrderTimeline } from "./order-timeline";

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

/**
 * Admin order detail page body.
 *
 * Fetches a single order by ID, renders a two-column read-only layout (items +
 * status on the left, money summary + addresses on the right) and surfaces the
 * status-transition control. A missing order (404) redirects to the list.
 */
export function OrderDetailView({ orderId }: OrderDetailViewProps) {
  const router = useRouter();
  const { data, dataUpdatedAt, isLoading, isError, error } =
    useAdminOrderControllerFindById(orderId);

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
        {dict.orders.loadOneError}
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

  // TASK-425: the add-ons are the reason the summary did not add up — they are
  // inside `total` but were in none of the rows above it. Both flags read the
  // response defensively (`?? 0`), because an order placed before add-ons existed
  // still has to render.
  const hasAddons = order.items.some((item) => (item.addons?.length ?? 0) > 0);
  const addonsTotal = Number(order.addonsTotal ?? 0);

  // Stock-hold badges (TASK-254). An order either currently holds reserved stock
  // (pre-shipment, not yet auto-restocked) or has had it returned — never both.
  const holdsStock =
    isPreShipmentStatus(order.status) && order.restockedAt == null;
  const heldQuantity = holdsStock
    ? order.items.reduce((sum, item) => sum + item.quantity, 0)
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/orders"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.orders.back}
        </Link>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.orders.title(order.id.slice(0, 8))}
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section className="flex flex-col gap-3 rounded-md border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={orderStatusBadgeVariant(order.status)}>
                {orderStatusLabel(order.status)}
              </Badge>
              <Badge variant={paymentStatusBadgeVariant(order.paymentStatus)}>
                {paymentStatusLabel(order.paymentStatus)}
              </Badge>
              {holdsStock ? (
                <Badge variant="warning">
                  {dict.orders.holdsStock(heldQuantity)}
                </Badge>
              ) : order.restockedAt != null ? (
                <Badge variant="secondary">
                  {dict.orders.restockedAt(formatTime(order.restockedAt))}
                </Badge>
              ) : null}
              {/* TASK-470 / 471 / 472: the derived marks of B-1, computed by the
                  same function the order LIST uses — so a row flagged there is
                  flagged here, and an operator can trust a card without a chip.
                  None of them is stored and none of them refuses a transition:
                  the owner's rule is that only the physically impossible is
                  blocked, and everything else is made visible.

                  `dataUpdatedAt` rather than the real clock: reading it during
                  render is impure, and the minute count is a statement about
                  the order as it was fetched. */}
              {orderDerivedMarks(order, dataUpdatedAt).map((mark) => (
                <Badge key={mark.kind} variant={mark.variant}>
                  {mark.label}
                </Badge>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {dict.orders.timeline(
                formatDateTime(order.createdAt),
                formatDateTime(order.updatedAt),
              )}
            </p>
            <Separator />
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">
                {dict.orders.updateStatus}
              </span>
              {/* TASK-332: the picker takes only the id. The legal moves AND the
                  optimistic-lock token both come from the server, so passing a
                  status down would just be a second, staler copy of it. */}
              <OrderStatusSelect orderId={order.id} />
            </div>
          </section>

          {/* TASK-330-C: everything about money for this order in one card. */}
          <section className="flex flex-col gap-3 rounded-md border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">
              {dict.orders.paymentHeading}
            </h3>
            {/* The status itself is the badge in the header section above — it is
                NOT repeated here. What belongs in this card is the money and the
                control that changes it. */}
            <SummaryRow
              label={dict.orders.paymentAmountLabel}
              value={formatCurrency(order.total)}
            />
            {/* TASK-472: "Повернуто X з Y", the fifth derived mark of B-1. Rendered
                only at PARTIALLY_REFUNDED — a full refund needs no fraction and a
                paid order has nothing to report — and only when the response
                actually carried the sum, since `refundedTotal` is absent (not
                "0.00") whenever the returns were not joined. Nothing here is
                stored: X is Σ Return.refundedAmount, computed on read. */}
            {order.paymentStatus ===
              OrderEntityPaymentStatus.PARTIALLY_REFUNDED &&
            order.refundedTotal != null ? (
              <SummaryRow
                label={dict.orders.refundedLabel}
                value={dict.orders.refundedOfTotal(
                  formatCurrency(order.refundedTotal),
                  formatCurrency(order.total),
                )}
              />
            ) : null}
            <Separator />
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">
                {dict.orderStatus.updatePaymentStatus}
              </span>
              <PaymentStatusSelect
                orderId={order.id}
                currentPaymentStatus={order.paymentStatus}
              />
            </div>
            {/* An honest blank rather than a card that implies there were no
                payment attempts. The method, the attempt history and the refund
                button need `Order.paymentMethod` on the entity plus the admin
                payments endpoints — none of which the merged backend exposes
                yet. See this file's note and the report for the exact contract. */}
            <p className="text-xs text-muted-foreground">
              {dict.orders.paymentAttemptsUnavailable}
            </p>
          </section>

          {/* TASK-335 / 336: waybill + operator-only notes. */}
          <section className="flex flex-col gap-3 rounded-md border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">
              {dict.orders.detailsHeading}
            </h3>
            <OrderDetailsForm order={order} />
          </section>

          <section className="flex flex-col gap-2">
            <div className="rounded-lg border border-border shadow-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{dict.orders.itemProduct}</TableHead>
                    <TableHead className="text-right">
                      {dict.orders.itemUnitPrice}
                    </TableHead>
                    <TableHead className="text-right">
                      {dict.orders.itemQty}
                    </TableHead>
                    <TableHead className="text-right">
                      {dict.orders.itemLineTotal}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => (
                    <Fragment key={item.id}>
                      <TableRow>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/products/${item.productId}/edit`}
                              aria-label={dict.orders.viewProductAria(
                                item.productName,
                              )}
                              className="font-medium text-primary hover:underline"
                            >
                              {item.productName}
                            </Link>
                            {/* TASK-470: «Позиція недоступна». A LINE mark, not
                                an order one — the server says which lines
                                (`unavailableItemIds`), because only it can see
                                whether the catalogue row was deleted,
                                unpublished or oversold. Absent (never empty) on
                                a response that did not measure it, so `?.`
                                renders nothing rather than claiming "all fine".
                                Nothing is sent to the buyer automatically: the
                                choice between a replacement, a refund and
                                waiting is made by a person (B-1 §3). */}
                            {order.unavailableItemIds?.includes(item.id) ? (
                              <Badge
                                variant="destructive"
                                title={dict.orders.markItemUnavailableHint}
                              >
                                {dict.orders.markItemUnavailable}
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(item.price)}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.quantity}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(item.lineTotal)}
                        </TableCell>
                      </TableRow>
                      {/* TASK-425: the add-on services bought with this line —
                          frozen name/price snapshots the API has always sent and
                          this page never showed. A SUB-ROW, not a fold into the
                          line: `lineTotal` is price × quantity by definition
                          (order-item.entity.ts) and the add-ons are summed on the
                          order as `addonsTotal`. Optional-chained because the
                          array is required by the contract but a response that
                          predates it must not blank the whole page. */}
                      {item.addons?.map((addon) => (
                        <TableRow key={addon.id}>
                          <TableCell
                            colSpan={3}
                            className="py-1.5 pl-8 text-xs text-muted-foreground"
                          >
                            + {addon.name}
                          </TableCell>
                          <TableCell className="py-1.5 text-right text-xs text-muted-foreground">
                            {formatCurrency(addon.price)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* TASK-341: there is no "edit lines" control here, and this says so.
                Changing an order's lines means returning and re-reserving stock
                atomically while recomputing totals against the discount and
                add-on invariants — the backend deliberately does not implement
                it. An absent explanation is better than a button that silently
                does nothing, and a stated rule is better than an absent one. */}
            {hasAddons ? (
              <p className="text-xs text-muted-foreground">
                {dict.orders.addonsHint}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {dict.orders.itemsLockedHint}
            </p>
          </section>
        </div>

        {/* Sidebar column */}
        <div className="flex flex-col gap-6">
          {/* TASK-425: the customer card used to render only for ACCOUNT orders,
              so a guest order — the whole point of TASK-338 — showed no customer
              at all on the one page an operator opens while the phone is ringing.
              Same three-way branch the order LIST already had, badge included, so
              "who is this" is answered identically in both places. */}
          {order.customer ? (
            <section className="flex flex-col gap-1 rounded-md border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {dict.orders.customer}
                </h3>
                <Badge variant="secondary">
                  {dict.orders.customerTypeAccount}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                <div>{order.customer.email}</div>
                {(order.customer.firstName || order.customer.lastName) && (
                  <div>
                    {[order.customer.firstName, order.customer.lastName]
                      .filter(Boolean)
                      .join(" ")}
                  </div>
                )}
              </div>
            </section>
          ) : order.guest ? (
            <section className="flex flex-col gap-1 rounded-md border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {dict.orders.customer}
                </h3>
                <Badge variant="warning">{dict.orders.customerTypeGuest}</Badge>
              </div>
              {/* The contact typed at checkout IS the customer record here: there
                  is no account to look anything up in.

                  Every line is guarded individually, the email included: on an
                  order the operator took by phone it is legitimately null
                  (TASK-426 made it optional, and the API answers `email: null`).
                  An unguarded email line rendered an empty row above the phone —
                  the card looked broken on exactly the orders the operator
                  creates themselves. */}
              <div className="text-sm text-muted-foreground">
                {order.guest.email ? <div>{order.guest.email}</div> : null}
                {order.guest.name ? <div>{order.guest.name}</div> : null}
                {order.guest.phone ? <div>{order.guest.phone}</div> : null}
              </div>
            </section>
          ) : null}

          {/* TASK-484: directly under "who is this", because it answers the next
              question in the same conversation — "and how does he see it?".
              Shown for EVERY order, account ones included: an operator takes a
              phone order for a registered customer too, and that customer may
              never have signed in on the phone they are holding. */}
          <OrderAccessLinkCard orderId={orderId} />

          {/* Above the money block since TASK-425: this is what the operator
              reads out while the courier waits on the line. */}
          <section className="flex flex-col gap-3 rounded-md border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">
              {dict.orders.shippingAddress}
            </h3>
            <AddressLines address={shipping} />
            {/* TASK-341: correctable until the parcel is with the courier; after
                that the form is replaced by the reason, not disabled. */}
            <OrderAddressForm order={order} />
          </section>

          <section className="flex flex-col gap-2 rounded-md border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">
              {dict.orders.summary}
            </h3>
            <SummaryRow
              label={dict.orders.subtotal}
              value={formatCurrency(order.subtotal)}
            />
            {/* TASK-425: a discount with no code shown cannot be explained to the
                customer who is asking about it. */}
            <SummaryRow
              label={
                order.discountCode
                  ? dict.orders.discountWithCode(order.discountCode)
                  : dict.orders.discount
              }
              value={formatCurrency(order.discount)}
            />
            {/* TASK-425: the missing row. Without it the column reads
                subtotal + shipping + tax − discount and lands short of the total
                by exactly the add-ons, which is the complaint. Hidden at zero: an
                order with no add-ons adds up without it. */}
            {addonsTotal > 0 ? (
              <SummaryRow
                label={dict.orders.addonsTotal}
                value={formatCurrency(order.addonsTotal)}
              />
            ) : null}
            <SummaryRow
              label={dict.orders.shipping}
              value={formatCurrency(order.shippingCost)}
            />
            <SummaryRow
              label={dict.orders.tax}
              value={formatCurrency(order.tax)}
            />
            <Separator />
            <div className="flex items-center justify-between font-semibold">
              <span>{dict.orders.total}</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
          </section>
          {billingDiffers ? (
            <AddressBlock
              title={dict.orders.billingAddress}
              address={billing}
            />
          ) : null}

          {order.notes ? (
            // TASK-336: the CUSTOMER's own note, read-only and labelled as such.
            // It sits in a different card from `internalNotes` and says whose
            // words these are, because the failure mode of blurring the two is a
            // shop's internal remark reaching the buyer it is about.
            <section className="flex flex-col gap-1 rounded-md border border-border p-4">
              <h3 className="text-sm font-semibold text-foreground">
                {dict.orders.notes}
              </h3>
              <p className="text-sm text-muted-foreground">{order.notes}</p>
              <p className="text-xs text-muted-foreground">
                {dict.orders.customerNotesHint}
              </p>
            </section>
          ) : null}
        </div>
      </div>

      {/* TASK-251: full status/payment change timeline, spanning the full width
          below the two-column layout. */}
      <section className="flex flex-col gap-3 rounded-md border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">
          {dict.orders.timelineHeading}
        </h3>
        <OrderTimeline orderId={order.id} customerUserId={order.userId} />
      </section>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

/**
 * The address itself, without a card around it — the shipping block now owns its
 * own heading so it can host the edit form underneath.
 */
function AddressLines({ address }: { address: AddressFields | null }) {
  if (!address) {
    return null;
  }

  const name = [address.firstName, address.lastName].filter(Boolean).join(" ");
  const cityLine = [address.city, address.state, address.postalCode]
    .filter(Boolean)
    .join(", ");

  return (
    <address className="text-sm not-italic text-muted-foreground">
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

/** Read-only address card — still used for the billing address, which has no
 *  edit path of its own (nothing ships to it). */
function AddressBlock({
  title,
  address,
}: {
  title: string;
  address: AddressFields | null;
}) {
  if (!address) {
    return null;
  }

  return (
    <section className="flex flex-col gap-1 rounded-md border border-border p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <AddressLines address={address} />
    </section>
  );
}
