"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  isPreShipmentStatus,
  orderStatusBadgeVariant,
  orderStatusLabel,
  paymentStatusBadgeVariant,
  paymentStatusLabel,
  useAdminOrderControllerFindById,
} from "@/entities/order";
import { OrderStatusSelect } from "@/features/order-status-update";
import { PaymentStatusSelect } from "@/features/order-payment-update";
import { OrderDetailsForm } from "@/features/order-details-form";
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
import { formatCurrency } from "@/shared/lib";
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

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** Time-only variant for the restocked-at badge (TASK-254). */
const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeStyle: "short",
});

/**
 * Admin order detail page body.
 *
 * Fetches a single order by ID, renders a two-column read-only layout (items +
 * status on the left, money summary + addresses on the right) and surfaces the
 * status-transition control. A missing order (404) redirects to the list.
 */
export function OrderDetailView({ orderId }: OrderDetailViewProps) {
  const router = useRouter();
  const { data, isLoading, isError, error } =
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
                  {dict.orders.restockedAt(
                    timeFormatter.format(new Date(order.restockedAt)),
                  )}
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {dict.orders.timeline(
                dateFormatter.format(new Date(order.createdAt)),
                dateFormatter.format(new Date(order.updatedAt)),
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

          <section className="rounded-lg border border-border shadow-card overflow-hidden">
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
                  <TableRow key={item.id}>
                    <TableCell>
                      <Link
                        href={`/products/${item.productId}/edit`}
                        aria-label={dict.orders.viewProductAria(
                          item.productName,
                        )}
                        className="font-medium text-primary hover:underline"
                      >
                        {item.productName}
                      </Link>
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
                ))}
              </TableBody>
            </Table>
          </section>
        </div>

        {/* Sidebar column */}
        <div className="flex flex-col gap-6">
          {order.customer ? (
            <section className="flex flex-col gap-1 rounded-md border border-border p-4">
              <h3 className="text-sm font-semibold text-foreground">
                {dict.orders.customer}
              </h3>
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
          ) : null}

          <section className="flex flex-col gap-2 rounded-md border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">
              {dict.orders.summary}
            </h3>
            <SummaryRow
              label={dict.orders.subtotal}
              value={formatCurrency(order.subtotal)}
            />
            <SummaryRow
              label={dict.orders.discount}
              value={formatCurrency(order.discount)}
            />
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

          <AddressBlock
            title={dict.orders.shippingAddress}
            address={shipping}
          />
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

  const name = [address.firstName, address.lastName].filter(Boolean).join(" ");
  const cityLine = [address.city, address.state, address.postalCode]
    .filter(Boolean)
    .join(", ");

  return (
    <section className="flex flex-col gap-1 rounded-md border border-border p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <address className="text-sm not-italic text-muted-foreground">
        {name ? <div>{name}</div> : null}
        {address.company ? <div>{address.company}</div> : null}
        {address.address1 ? <div>{address.address1}</div> : null}
        {address.address2 ? <div>{address.address2}</div> : null}
        {cityLine ? <div>{cityLine}</div> : null}
        {address.country ? <div>{address.country}</div> : null}
        {address.phone ? <div>{address.phone}</div> : null}
      </address>
    </section>
  );
}
