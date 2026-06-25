"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  orderStatusBadgeVariant,
  paymentStatusBadgeVariant,
  useAdminOrderControllerFindById,
} from "@/entities/order";
import { OrderStatusSelect } from "@/features/order-status-update";
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
import { OrderDetailSkeleton } from "./order-detail-skeleton";

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

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatMoney(value: string): string {
  return moneyFormatter.format(Number(value));
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
        Failed to load order. Please try again.
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/orders"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to orders
        </Link>
        <h2 className="text-2xl font-bold text-foreground">
          Order #{order.id.slice(0, 8)}
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section className="flex flex-col gap-3 rounded-md border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={orderStatusBadgeVariant(order.status)}>
                {order.status}
              </Badge>
              <Badge variant={paymentStatusBadgeVariant(order.paymentStatus)}>
                Payment: {order.paymentStatus}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Created {dateFormatter.format(new Date(order.createdAt))} ·
              Updated {dateFormatter.format(new Date(order.updatedAt))}
            </p>
            <Separator />
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">
                Update status
              </span>
              <OrderStatusSelect
                orderId={order.id}
                currentStatus={order.status}
              />
            </div>
          </section>

          <section className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Line total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.productName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.variantName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(item.price)}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.quantity}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(item.lineTotal)}
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
                Customer
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
            <h3 className="text-sm font-semibold text-foreground">Summary</h3>
            <SummaryRow label="Subtotal" value={formatMoney(order.subtotal)} />
            <SummaryRow label="Discount" value={formatMoney(order.discount)} />
            <SummaryRow
              label="Shipping"
              value={formatMoney(order.shippingCost)}
            />
            <SummaryRow label="Tax" value={formatMoney(order.tax)} />
            <Separator />
            <div className="flex items-center justify-between font-semibold">
              <span>Total</span>
              <span>{formatMoney(order.total)}</span>
            </div>
          </section>

          <AddressBlock title="Shipping address" address={shipping} />
          {billingDiffers ? (
            <AddressBlock title="Billing address" address={billing} />
          ) : null}

          {order.notes ? (
            <section className="flex flex-col gap-1 rounded-md border border-border p-4">
              <h3 className="text-sm font-semibold text-foreground">Notes</h3>
              <p className="text-sm text-muted-foreground">{order.notes}</p>
            </section>
          ) : null}
        </div>
      </div>
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
