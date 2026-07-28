import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CartModule } from '../cart';
import { CartIdentityInterceptor } from '../cart/interceptors';
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
  // ConfigModule: GUEST_ORDER_TOKEN_TTL_DAYS and STORE_CLIENT_URL (TASK-338).
  imports: [
    ConfigModule,
    CartModule,
    UserModule,
    DeliveryModule,
    DiscountModule,
    AddonServiceModule,
  ],
  controllers: [OrderController, AdminOrderController],
  // TASK-338: OrderController resolves the buyer's identity exactly as the cart
  // does — a JWT when there is one, the `cartToken` cookie otherwise — so a guest
  // converts the very cart they already own. CartIdentityInterceptor is listed
  // here because a route-scoped enhancer is instantiated from the injector of the
  // module that USES it, not the one that happens to declare it.
  providers: [OrderRepository, OrderService, CartIdentityInterceptor],
  exports: [OrderService],
})
export class OrderModule {}
