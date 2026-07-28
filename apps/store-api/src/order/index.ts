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
  isTerminalStatus,
} from './order-state-machine';
export { OrderErrorCode } from './order.errors';
export { CreateOrderDto, UpdateOrderStatusDto, OrderListQueryDto, AddressDto } from './dto';
export type {
  OrderWithItems,
  OrderItemRow,
  CreateOrderParams,
  ShippingAddressData,
} from './order.types';
