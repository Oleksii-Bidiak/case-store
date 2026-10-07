import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CartIdentityInterceptor, CartModule } from '../cart';
import { UserModule } from '../user';
import { DeliveryModule } from '../delivery';
import { DiscountModule } from '../discount';
import { AddonServiceModule } from '../addon-service';
import { SearchModule } from '../search';
import { OrderRepository } from './order.repository';
// TASK-483: the public lookup's own narrow query — see its docblock for why it
// is not a method on OrderRepository.
import { OrderLookupRepository } from './order-lookup.repository';
import { OrderService } from './order.service';
// TASK-485: the seam the auth side claims guest orders through. Imported here
// (never the other way round) because this module is the one that IMPLEMENTS it.
import { GUEST_ORDER_CLAIM_PORT } from '../common/ports';
import { OrderController } from './order.controller';
// TASK-679: the guest's Telegram routes — they resolve the order by its access
// token, which is this module's business; the binding work is NotificationModule's
// (global) CustomerTelegramService.
import { GuestOrderNotificationController } from './guest-order-notification.controller';
import { AdminOrderController } from './admin-order.controller';
import { ReturnRepository } from './returns/return.repository';
import { ReturnService } from './returns/return.service';
import { ReturnController } from './returns/return.controller';
import {
  AdminOrderReturnController,
  AdminReturnController,
} from './returns/admin-return.controller';

@Module({
  // UserModule provides UserRepository (recipient lookup for confirmation
  // email). DeliveryModule provides DeliveryService (NP shipping estimate at
  // order creation). DiscountModule provides DiscountService (promo-code
  // recompute + redeem at order creation, TASK-079). NotificationOutboxService
  // (order-confirmation enqueue, TASK-103) comes from the global NotificationOutboxModule.
  // AddonServiceModule provides AddonApplicabilityResolver — the order re-resolves
  // each line's add-ons fresh at creation time before freezing them into
  // OrderItemAddon snapshots (TASK-174).
  // ConfigModule: GUEST_ORDER_TOKEN_TTL_DAYS and STORE_CLIENT_URL (TASK-338).
  // SearchModule provides the ProductIndexer seam: every stock movement here
  // (sale, cancel-restock, revive, return) has to refresh the search document's
  // `inStock`, which became a Meilisearch facet in TASK-417. No cycle —
  // SearchModule knows nothing about orders.
  imports: [
    ConfigModule,
    CartModule,
    UserModule,
    DeliveryModule,
    DiscountModule,
    AddonServiceModule,
    SearchModule,
  ],
  controllers: [
    OrderController,
    GuestOrderNotificationController,
    AdminOrderController,
    ReturnController,
    AdminReturnController,
    // TASK-469: the admin door onto a return, hung off the ORDER path rather than
    // the returns queue — a return the shop opens is opened against an order.
    AdminOrderReturnController,
  ],
  // TASK-338: OrderController resolves the buyer's identity exactly as the cart
  // does — a JWT when there is one, the `cartToken` cookie otherwise — so a guest
  // converts the very cart they already own. CartIdentityInterceptor is listed
  // here because a route-scoped enhancer is instantiated from the injector of the
  // module that USES it, not the one that happens to declare it.
  // TASK-340: returns live inside the order module — a return is an order line
  // coming back, and splitting them would put the stock guard on one side of a
  // module boundary and the order it belongs to on the other.
  providers: [
    OrderRepository,
    OrderLookupRepository,
    OrderService,
    ReturnRepository,
    ReturnService,
    CartIdentityInterceptor,
    // TASK-485: alias, not a second instance — `useExisting` binds the token to
    // the OrderService already provided above. `EmailVerificationService` pulls
    // it out of the container by token, so nothing has to import this module and
    // the AuthModule → OrderModule → UserModule → AuthModule cycle never forms.
    { provide: GUEST_ORDER_CLAIM_PORT, useExisting: OrderService },
  ],
  exports: [OrderService, ReturnService, GUEST_ORDER_CLAIM_PORT],
})
export class OrderModule {}
