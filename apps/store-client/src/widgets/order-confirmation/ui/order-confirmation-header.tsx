import type {
  OrderEntityStatus,
  OrderEntityPaymentStatus,
} from "@/entities/order";

interface OrderConfirmationHeaderProps {
  orderId: string;
  status: OrderEntityStatus;
  paymentStatus: OrderEntityPaymentStatus;
  /** ISO timestamp */
  createdAt: string;
}

/** Token-based badge colours per status value (no raw hex). */
const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-muted text-muted-foreground",
  CONFIRMED: "bg-primary/10 text-primary",
  PROCESSING: "bg-primary/20 text-primary",
  SHIPPED: "bg-primary/30 text-primary",
  DELIVERED: "bg-primary/10 text-primary font-semibold",
  CANCELLED: "bg-destructive/10 text-destructive",
  REFUNDED: "bg-destructive/10 text-destructive",
  PAID: "bg-primary/10 text-primary",
  FAILED: "bg-destructive/10 text-destructive",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
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
 * OrderConfirmationHeader — top block of the confirmation page. Shows the
 * thank-you heading, a short order-number reference (first 8 chars of the UUID),
 * the placed date, and colour-coded order + payment status badges.
 * Pure presentational; all data arrives via props.
 */
export function OrderConfirmationHeader({
  orderId,
  status,
  paymentStatus,
  createdAt,
}: OrderConfirmationHeaderProps) {
  const orderNumber = orderId.slice(0, 8).toUpperCase();

  return (
    <header className="flex flex-col gap-3">
      <h1 className="text-3xl font-bold text-foreground">
        Thank you for your order!
      </h1>

      <dl className="flex flex-col gap-1 text-sm">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Order number:</dt>
          <dd className="font-medium text-foreground">#{orderNumber}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Placed on:</dt>
          <dd className="text-foreground">{formatDate(createdAt)}</dd>
        </div>
      </dl>

      <dl className="flex flex-wrap items-center gap-2">
        <dt className="sr-only">Order status</dt>
        <dd>
          <span
            aria-label={`Order status: ${status}`}
            className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${badgeClass(status)}`}
          >
            {status}
          </span>
        </dd>
        <dt className="sr-only">Payment status</dt>
        <dd>
          <span
            aria-label={`Payment status: ${paymentStatus}`}
            className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${badgeClass(paymentStatus)}`}
          >
            Payment: {paymentStatus}
          </span>
        </dd>
      </dl>
    </header>
  );
}
