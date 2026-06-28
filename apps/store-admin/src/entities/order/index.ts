// Order entity — domain types, API hooks, and query-key getters.
// Re-exports the Orval-generated admin-orders client from the shared layer so
// the rest of the app depends on `@/entities/order` rather than reaching into
// `@/shared/api` directly.

export {
  useAdminOrderControllerFindAll,
  useAdminOrderControllerFindById,
  useAdminOrderControllerUpdateStatus,
  useAdminOrderControllerUpdatePaymentStatus,
  getAdminOrderControllerFindAllQueryKey,
  getAdminOrderControllerFindByIdQueryKey,
  // Status / payment enum value objects (used for filters and badge mapping).
  OrderEntityStatus,
  OrderEntityPaymentStatus,
} from "@/shared/api";

export type {
  OrderEntity,
  OrderItemEntity,
  UpdateOrderStatusDto,
  UpdateOrderPaymentStatusDto,
  AdminOrderControllerFindAllParams,
  AdminOrderListResponse,
  AdminOrderResponseEnvelope,
} from "@/shared/api";

export {
  orderStatusBadgeVariant,
  paymentStatusBadgeVariant,
} from "./status-badge";

export { orderStatusLabel, paymentStatusLabel } from "./status-label";
