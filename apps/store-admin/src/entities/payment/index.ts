// Payment entity — one LiqPay ATTEMPT against an order (TASK-371).
// Re-exports the Orval-generated admin payments client from the shared layer so
// the rest of the app depends on `@/entities/payment` rather than reaching into
// `@/shared/api` directly.
//
// R2: read-only. A refund is a money-journal write now (`POST
// /admin/orders/:id/money/out` with `LIQPAY_REFUND`, `entities/order`); the
// per-attempt refund endpoint and its hook are gone.

export {
  useAdminListOrderPayments,
  getAdminListOrderPaymentsQueryKey,
  PaymentEntityStatus,
} from "@/shared/api";

export type { PaymentEntity } from "@/shared/api";

export {
  paymentAttemptStatusLabel,
  paymentAttemptStatusBadgeVariant,
} from "./status";
