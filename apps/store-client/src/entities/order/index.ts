// Order entity — re-exports generated Order types and API hooks (FSD entities layer).
// Upper layers (features/widgets) import order data access from here, not from
// the generated client directly.
export type {
  OrderEntity,
  OrderItemEntity,
  OrderEntityStatus,
  OrderEntityPaymentStatus,
  OrderEntityShippingAddress,
  OrderEntityBillingAddress,
  OrderListResponseEnvelope,
  OrderResponseEnvelope,
  CreateOrderDto,
  AddressDto,
  CreateOrder201,
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
