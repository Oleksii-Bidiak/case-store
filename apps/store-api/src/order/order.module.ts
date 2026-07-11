import { Module } from '@nestjs/common';
import { CartModule } from '../cart';
import { UserModule } from '../user';
import { DeliveryModule } from '../delivery';
import { DiscountModule } from '../discount';
import { AddonServiceModule } from '../addon-service';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { AdminOrderController } from './admin-order.controller';

@Module({
  // UserModule provides UserRepository (recipient lookup for confirmation
  // email). DeliveryModule provides DeliveryService (NP shipping estimate at
  // order creation). DiscountModule provides DiscountService (promo-code
  // recompute + redeem at order creation, TASK-079). MailOutboxService
  // (order-confirmation enqueue, TASK-103) comes from the global MailOutboxModule.
  // AddonServiceModule provides AddonApplicabilityResolver — the order re-resolves
  // each line's add-ons fresh at creation time before freezing them into
  // OrderItemAddon snapshots (TASK-174).
  imports: [CartModule, UserModule, DeliveryModule, DiscountModule, AddonServiceModule],
  controllers: [OrderController, AdminOrderController],
  providers: [OrderRepository, OrderService],
  exports: [OrderService],
})
export class OrderModule {}
