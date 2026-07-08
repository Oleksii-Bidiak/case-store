// Order entity — domain types, API hooks, and query-key getters.
// Re-exports the Orval-generated admin-orders client from the shared layer so
// the rest of the app depends on `@/entities/order` rather than reaching into
// `@/shared/api` directly.

export {
  useAdminOrderControllerFindAll,
  useAdminOrderControllerFindById,
  useAdminOrderControllerUpdateStatus,
  useAdminOrderControllerUpdatePaymentStatus,
  useAdminOrderControllerGetHistory,
  getAdminOrderControllerFindAllQueryKey,
  getAdminOrderControllerFindByIdQueryKey,
  getAdminOrderControllerGetHistoryQueryKey,
  // Status / payment enum value objects (used for filters and badge mapping).
  OrderEntityStatus,
  OrderEntityPaymentStatus,
  // History change-type discriminator (TASK-251).
  OrderStatusHistoryEntityChangeType,
} from "@/shared/api";

export type {
  OrderEntity,
  OrderItemEntity,
  OrderStatusHistoryEntity,
  UpdateOrderStatusDto,
  UpdateOrderPaymentStatusDto,
  AdminOrderControllerFindAllParams,
  AdminOrderListResponse,
  AdminOrderResponseEnvelope,
  AdminOrderHistoryResponse,
} from "@/shared/api";

export {
  orderStatusBadgeVariant,
  paymentStatusBadgeVariant,
} from "./status-badge";

export { orderStatusLabel, paymentStatusLabel } from "./status-label";

export { isPreShipmentStatus } from "./is-pre-shipment-status";

export { historyActorLabel, historyChangeLabel } from "./history-label";
