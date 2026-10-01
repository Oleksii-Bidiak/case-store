import {
  statusBadgeClass as badgeClass,
  type OrderEntityStatus,
  type OrderEntityPaymentStatus,
} from "@/entities/order";
import { dict, H1_CLASS } from "@/shared/config";
import { formatDate } from "@/shared/lib/format";

interface OrderConfirmationHeaderProps {
  orderId: string;
  status: OrderEntityStatus;
  paymentStatus: OrderEntityPaymentStatus;
  /** ISO timestamp */
  createdAt: string;
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
      <h1 className={`${H1_CLASS} text-foreground`}>{dict.order.thankYou}</h1>

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
