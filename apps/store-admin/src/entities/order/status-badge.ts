import { OrderEntityStatus, OrderEntityPaymentStatus } from "@/shared/api";

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning";

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
 */
export function paymentStatusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case OrderEntityPaymentStatus.PAID:
      return "success";
    case OrderEntityPaymentStatus.FAILED:
    case OrderEntityPaymentStatus.REFUNDED:
      return "destructive";
    case OrderEntityPaymentStatus.PENDING:
    default:
      return "warning";
  }
}
