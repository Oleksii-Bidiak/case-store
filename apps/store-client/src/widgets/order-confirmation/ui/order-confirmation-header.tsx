import type {
  OrderEntityStatus,
  OrderEntityPaymentStatus,
} from "@/entities/order";
import { dict } from "@/shared/config";

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
        {dict.order.thankYou}
      </h1>

      <dl className="flex flex-col gap-1 text-sm">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">{dict.order.orderNumber}</dt>
          <dd className="font-medium text-foreground">#{orderNumber}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">{dict.order.placedOn}</dt>
          <dd className="text-foreground">{formatDate(createdAt)}</dd>
        </div>
      </dl>

      <dl className="flex flex-wrap items-center gap-2">
        <dt className="sr-only">{dict.order.orderStatusSr}</dt>
        <dd>
          <span
            aria-label={dict.order.orderStatusAria(status)}
            className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${badgeClass(status)}`}
          >
            {dict.order.orderStatusLabels[status] ?? status}
          </span>
        </dd>
        <dt className="sr-only">{dict.order.paymentStatusSr}</dt>
        <dd>
          <span
            aria-label={dict.order.paymentStatusAria(paymentStatus)}
            className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${badgeClass(paymentStatus)}`}
          >
            {dict.order.paymentLabel(paymentStatus)}
          </span>
        </dd>
      </dl>
    </header>
  );
}
