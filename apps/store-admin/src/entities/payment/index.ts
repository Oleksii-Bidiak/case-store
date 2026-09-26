// Payment entity — one LiqPay ATTEMPT against an order (TASK-371).
// Re-exports the Orval-generated admin payments client from the shared layer so
// the rest of the app depends on `@/entities/payment` rather than reaching into
// `@/shared/api` directly.

export {
  useAdminListOrderPayments,
  getAdminListOrderPaymentsQueryKey,
  useAdminRefundPayment,
  PaymentEntityStatus,
} from "@/shared/api";

export type { PaymentEntity, RefundRequestDto } from "@/shared/api";

export {
  paymentAttemptStatusLabel,
  paymentAttemptStatusBadgeVariant,
  isRefundableAttempt,
} from "./status";
