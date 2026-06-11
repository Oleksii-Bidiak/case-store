// Order Module — public API
export { OrderModule } from './order.module';
export { OrderService } from './order.service';
export { OrderController } from './order.controller';
export { OrderRepository } from './order.repository';
export { OrderEntity, OrderItemEntity } from './entities';
export { CreateOrderDto, UpdateOrderStatusDto, OrderListQueryDto, AddressDto } from './dto';
export type {
  OrderWithItems,
  OrderItemRow,
  CreateOrderParams,
  ShippingAddressData,
} from './order.types';
