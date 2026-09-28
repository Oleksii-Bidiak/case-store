// Order Module — public API
export { OrderModule } from './order.module';
export { OrderService } from './order.service';
export { OrderController } from './order.controller';
export { OrderRepository } from './order.repository';
export { OrderEntity, OrderItemEntity } from './entities';
// TASK-332: the transition table is part of this module's public contract. The
// admin UI and the payment module both need to reason about what an order may do
// next, and both must consult THIS table rather than re-deriving one of their own
// — a second copy of the rules is a second set of rules.
export {
  ORDER_TRANSITIONS,
  allowedTransitions,
  canTransition,
  // TASK-431: the payment table is public for the same reason — the payment
  // module writes `paymentStatus` too, and a second copy of these rules would be
  // a second set of rules.
  PAYMENT_TRANSITIONS,
  allowedPaymentTransitions,
  canTransitionPayment,
} from './order-state-machine';
// TASK-643: the delivery × payment matrix is public for the same reason as the
// transition tables — the delivery module serves it to the storefront, and a
// second copy of the rule would be a second rule.
export {
  DELIVERY_PAYMENT_MATRIX,
  allowedPaymentMethods,
  isPaymentAllowedForDelivery,
} from './delivery-payment-matrix';
export { flatShippingCost, isCourierFree, resolveDeliveryMethod } from './shipping-cost';
export type { FlatPricedDeliveryMethod, FlatShippingInput } from './shipping-cost';
export {
  OrderErrorCode,
  DeliveryOrderErrorCode,
  deliveryPaymentNotAllowedError,
} from './order.errors';
export { CreateOrderDto, UpdateOrderStatusDto, OrderListQueryDto, AddressDto } from './dto';
export type {
  OrderWithItems,
  OrderItemRow,
  CreateOrderParams,
  DeliveryCarrier,
  ShippingAddressData,
} from './order.types';
