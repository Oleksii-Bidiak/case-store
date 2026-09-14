export { OrderEntity, OrderCustomerData, OrderGuestData } from './order.entity';
export { OrderItemEntity, OrderItemAddonEntity } from './order-item.entity';
export { OrderStatusHistoryEntity } from './order-status-history.entity';
// TASK-483: the public "check my order" projection. Deliberately a sibling of
// OrderEntity rather than a mode of it — see the class docblock.
export {
  PublicOrderEntity,
  PublicOrderItemEntity,
  PublicOrderDeliveryEntity,
  type PublicOrderRow,
} from './public-order.entity';
