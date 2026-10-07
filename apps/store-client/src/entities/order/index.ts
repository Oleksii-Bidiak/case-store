// Order entity — re-exports generated Order types and API hooks (FSD entities layer).
// Upper layers (features/widgets) import order data access from here, not from
// the generated client directly.
export type {
  OrderEntity,
  OrderItemEntity,
  OrderEntityStatus,
  OrderEntityPaymentStatus,
  OrderShippingAddressEntity,
  OrderListResponseEnvelope,
  OrderResponseEnvelope,
  CreateOrderDto,
  AddressDto,
  CreateOrder201,
  // TASK-679: the create response — OrderEntity plus a guest's one-time
  // `guestAccessToken`, which no read ever returns again.
  CreatedOrderEntity,
  GetOrder200,
  CancelOrder200,
  // Guest checkout (TASK-338): the contact block sent at checkout, and the
  // snapshot of it the order carries back.
  GuestContactDto,
  OrderGuestData,
  GetGuestOrder200,
  // Public "check my order" lookup (TASK-483). A SEPARATE projection from
  // OrderEntity — no address, no email, no phone, no internal notes — so these
  // types are deliberately not interchangeable with the ones above.
  OrderLookupDto,
  PublicOrderEntity,
  PublicOrderItemEntity,
  PublicOrderDeliveryEntity,
  PublicOrderEntityStatus,
  PublicOrderEntityPaymentStatus,
  PublicOrderLookupResponseEnvelope,
} from "@/shared/api/generated/models";

// The payment method an order is created with (TASK-650). A value export, not
// only a type: the checkout maps its own vocabulary onto these constants, so a
// method the API does not know fails to compile instead of failing at runtime.
export { CreateOrderDtoPaymentMethod } from "@/shared/api/generated/models";

// TASK-802: the one badge map for order and payment statuses; TASK-868: coloured
// by design-system §2 and rendered through `shared/ui` Badge.
export {
  STATUS_BADGE,
  STATUS_BADGE_FALLBACK,
  statusBadgeStyle,
  type StatusBadgeStyle,
  type StatusBadgeVariant,
} from "./lib/status-badge";
export { OrderStatusBadge } from "./ui/order-status-badge";

// TASK-217: the account order screens (history card now, detail next).
export type {
  GetOrdersParams,
  GetOrdersStatusItem,
} from "@/shared/api/generated/models";
export {
  reservationMinutesLeft,
  awaitingPaymentMinutes,
} from "./lib/payment-countdown";
export { useNow, NOW_TICK_MS } from "./lib/use-now";
export { novaPoshtaTrackingUrl } from "./lib/tracking";
export { OrderTrackingNumber } from "./ui/order-tracking-number";
export { OrderItemThumb } from "./ui/order-item-thumb";
export { orderUnitCount } from "./lib/order-units";
export {
  ORDER_TIMELINE_LENGTH,
  orderTimelineIndex,
  orderTimelineStates,
  type OrderTimelineStepState,
} from "./lib/order-timeline";
export {
  orderDeliveryDetails,
  type OrderDeliveryDetails,
  type OrderDeliveryPlaceKind,
  type OrderPickupPointSnapshot,
} from "./lib/order-delivery";
// TASK-647: «Доставка» after checkout — the confirmation page and the guest
// order page render the block; the account detail reuses the link and note.
export {
  OrderDeliveryBlock,
  OrderDeliveryMapLink,
  OrderDeliveryNote,
} from "./ui/order-delivery-block";
// Shared by the confirmation page and the account order detail — moved down
// from `widgets/order-confirmation`, which another widget may not import.
export { OrderItemRow } from "./ui/order-item-row";
export { OrderTotalsBreakdown } from "./ui/order-totals-breakdown";

export {
  useCreateOrder,
  useGetOrders,
  useGetOrder,
  useCancelOrder,
  getGetOrdersQueryKey,
  getGetOrderQueryKey,
  // A guest's only route back to their own order. The emailed token IS the
  // credential, so this one is deliberately not gated on a session.
  useGetGuestOrder,
  getGetGuestOrderQueryKey,
  // TASK-483: the public form. A mutation rather than a query because the phone
  // travels in the body — see the endpoint's docblock for why it is a POST.
  useLookupOrder,
} from "@/shared/api/generated/orders/orders";
