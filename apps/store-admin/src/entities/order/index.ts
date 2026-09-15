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
  // TASK-431: the same, for the PAYMENT status — already filtered by the
  // cross-rule that a full refund needs a cancelled order.
  useAdminOrderControllerGetAllowedPaymentTransitions,
  // TASK-335 / 336 / 341: waybill, internal notes, pre-shipment address edit.
  useAdminOrderControllerUpdateDetails,
  // TASK-341: operator-created (phone) orders.
  useAdminOrderControllerCreate,
  // TASK-484: issue a fresh buyer link, retiring the previous one. A mutation
  // with no query twin on purpose — the server keeps only the token's hash, so
  // "read the current link" is a question nothing can answer.
  useAdminOrderControllerIssueAccessLink,
  getAdminOrderControllerFindAllQueryKey,
  getAdminOrderControllerFindByIdQueryKey,
  getAdminOrderControllerGetHistoryQueryKey,
  getAdminOrderControllerGetAllowedTransitionsQueryKey,
  getAdminOrderControllerGetAllowedPaymentTransitionsQueryKey,
  // Status / payment enum value objects (used for filters and badge mapping).
  OrderEntityStatus,
  OrderEntityPaymentStatus,
  // TASK-468: how the order is BEING paid for, as opposed to whether it has been.
  // The «оплату не підтверджено — відправляти?» warning needs both: on
  // ON_DELIVERY an unpaid shipment is simply how cash-on-delivery works.
  OrderEntityPaymentMethod,
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
  AdminOrderAllowedPaymentTransitions,
  AdminOrderAllowedPaymentTransitionsResponse,
  // TASK-484: the one-time buyer link — on the create response's `meta`, and as
  // the body of the issue-a-new-one endpoint.
  AdminOrderAccessLink,
  AdminOrderAccessLinkResponse,
  AdminOrderCreatedResponseEnvelope,
} from "@/shared/api";

export {
  orderStatusBadgeVariant,
  paymentStatusBadgeVariant,
} from "./status-badge";

export { orderStatusLabel, paymentStatusLabel } from "./status-label";

export { isPreShipmentStatus } from "./is-pre-shipment-status";

// TASK-470 / 471 / 472: the derived marks of B-1, computed identically for the
// list row and the order card so the two can never flag different orders.
export { orderDerivedMarks, minutesUntil } from "./order-marks";
export type { OrderMark, OrderMarkKind, OrderMarkSource } from "./order-marks";

export { historyActorLabel, historyChangeLabel } from "./history-label";
