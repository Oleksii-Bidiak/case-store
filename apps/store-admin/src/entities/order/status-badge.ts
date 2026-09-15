import { OrderEntityStatus, OrderEntityPaymentStatus } from "@/shared/api";

type BadgeVariant =
  "default" | "secondary" | "destructive" | "outline" | "success" | "warning";

/**
 * Map an order status to a shadcn/ui `Badge` variant. Shared by the order list
 * and order detail widgets so status colors stay consistent across the admin.
 *
 * Colors carry meaning (design-system §3): green `success` = the order reached
 * a good terminal/confirmed state, amber `warning` = awaiting action, red
 * `destructive` = cancelled/refunded, indigo `default` = in-progress.
 */
export function orderStatusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case OrderEntityStatus.DELIVERED:
      return "success";
    case OrderEntityStatus.CONFIRMED:
    case OrderEntityStatus.PROCESSING:
    case OrderEntityStatus.SHIPPED:
      return "default";
    case OrderEntityStatus.CANCELLED:
    case OrderEntityStatus.REFUNDED:
      return "destructive";
    case OrderEntityStatus.PENDING:
    default:
      return "warning";
  }
}

/**
 * Map a payment status to a shadcn/ui `Badge` variant. Paid = green `success`,
 * awaiting payment = amber `warning`, failed/refunded = red `destructive`.
 *
 * PARTIALLY_REFUNDED (TASK-431) is amber, not red: part of the money is still
 * the shop's and the order is usually still live, so it belongs with "needs
 * attention" rather than with "this one is closed and reversed". Red would put
 * it next to a full refund on the list and hide the difference that matters.
 */
export function paymentStatusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case OrderEntityPaymentStatus.PAID:
      return "success";
    case OrderEntityPaymentStatus.FAILED:
    case OrderEntityPaymentStatus.REFUNDED:
      return "destructive";
    case OrderEntityPaymentStatus.PARTIALLY_REFUNDED:
    case OrderEntityPaymentStatus.PENDING:
    default:
      return "warning";
  }
}
