import { OrderEntityStatus, OrderEntityPaymentStatus } from "@/shared/api";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

/**
 * Map an order status to a shadcn/ui `Badge` variant. Shared by the order list
 * and order detail widgets so status colors stay consistent across the admin.
 */
export function orderStatusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case OrderEntityStatus.DELIVERED:
    case OrderEntityStatus.CONFIRMED:
      return "default";
    case OrderEntityStatus.PROCESSING:
    case OrderEntityStatus.SHIPPED:
      return "outline";
    case OrderEntityStatus.CANCELLED:
    case OrderEntityStatus.REFUNDED:
      return "destructive";
    case OrderEntityStatus.PENDING:
    default:
      return "secondary";
  }
}

/**
 * Map a payment status to a shadcn/ui `Badge` variant.
 */
export function paymentStatusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case OrderEntityPaymentStatus.PAID:
      return "default";
    case OrderEntityPaymentStatus.FAILED:
    case OrderEntityPaymentStatus.REFUNDED:
      return "destructive";
    case OrderEntityPaymentStatus.PENDING:
    default:
      return "secondary";
  }
}
