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
  // TASK-332: the server's own list of legal next statuses + the lock token.
  useAdminOrderControllerGetAllowedTransitions,
  // TASK-335 / 336 / 341: waybill, internal notes, pre-shipment address edit.
  useAdminOrderControllerUpdateDetails,
  // TASK-341: operator-created (phone) orders.
  useAdminOrderControllerCreate,
  getAdminOrderControllerFindAllQueryKey,
  getAdminOrderControllerFindByIdQueryKey,
  getAdminOrderControllerGetHistoryQueryKey,
  getAdminOrderControllerGetAllowedTransitionsQueryKey,
  // Status / payment enum value objects (used for filters and badge mapping).
  OrderEntityStatus,
  OrderEntityPaymentStatus,
  // History change-type discriminator (TASK-251).
  OrderStatusHistoryEntityChangeType,
  // TASK-341: how the customer will pay on an operator-created order.
  CreateManualOrderDtoPaymentMethod,
} from "@/shared/api";

export type {
  OrderEntity,
  OrderItemEntity,
  OrderStatusHistoryEntity,
  UpdateOrderStatusDto,
  UpdateOrderPaymentStatusDto,
  UpdateOrderDetailsDto,
  CreateManualOrderDto,
  ManualOrderItemDto,
  GuestContactDto,
  AddressDto,
  AdminOrderControllerFindAllParams,
  AdminOrderListResponse,
  AdminOrderResponseEnvelope,
  AdminOrderHistoryResponse,
  AdminOrderAllowedTransitions,
  AdminOrderAllowedTransitionsResponse,
} from "@/shared/api";

export {
  orderStatusBadgeVariant,
  paymentStatusBadgeVariant,
} from "./status-badge";

export { orderStatusLabel, paymentStatusLabel } from "./status-label";

export { isPreShipmentStatus } from "./is-pre-shipment-status";

export { historyActorLabel, historyChangeLabel } from "./history-label";
