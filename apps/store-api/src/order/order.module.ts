import { Module } from '@nestjs/common';
import { CartModule } from '../cart';
import { UserModule } from '../user';
import { DeliveryModule } from '../delivery';
import { DiscountModule } from '../discount';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { AdminOrderController } from './admin-order.controller';

@Module({
  // UserModule provides UserRepository (recipient lookup for confirmation
  // email). DeliveryModule provides DeliveryService (NP shipping estimate at
  // order creation). DiscountModule provides DiscountService (promo-code
  // recompute + redeem at order creation, TASK-079). MailService comes from the
  // global MailModule.
  imports: [CartModule, UserModule, DeliveryModule, DiscountModule],
  controllers: [OrderController, AdminOrderController],
  providers: [OrderRepository, OrderService],
  exports: [OrderService],
})
export class OrderModule {}
