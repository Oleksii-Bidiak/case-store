// Order entity — re-exports generated Order types and API hooks (FSD entities layer).
// Upper layers (features/widgets) import order data access from here, not from
// the generated client directly.
export type {
  OrderEntity,
  OrderItemEntity,
  OrderListResponseEnvelope,
  OrderResponseEnvelope,
  CreateOrderDto,
  AddressDto,
  CreateOrder201,
  GetOrder200,
  CancelOrder200,
} from "@/shared/api/generated/models";

export {
  useCreateOrder,
  useGetOrders,
  useGetOrder,
  useCancelOrder,
  getGetOrdersQueryKey,
  getGetOrderQueryKey,
} from "@/shared/api/generated/orders/orders";
