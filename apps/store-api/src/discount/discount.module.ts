import { Module } from '@nestjs/common';
import { CartIdentityInterceptor, CartModule } from '../cart';
import { DiscountRepository } from './discount.repository';
import { DiscountService } from './discount.service';
import { DiscountController } from './discount.controller';
import { AdminDiscountController } from './admin-discount.controller';
import { PublicDiscountController } from './public-discount.controller';

/**
 * DiscountModule — promo-code validation, calculation, redemption, and admin
 * management. Imports {@link CartModule} for the preview path (reads the
 * caller's cart subtotal server-side). Exports {@link DiscountService} so
 * {@link OrderModule} can redeem inside the order-creation transaction.
 */
@Module({
  imports: [CartModule],
  controllers: [DiscountController, AdminDiscountController, PublicDiscountController],
  // CartIdentityInterceptor: the preview resolves a guest's cookie cart since
  // TASK-2010. Listed here because a route-scoped enhancer is instantiated from
  // the injector of the module that USES it (same note as OrderModule).
  providers: [DiscountRepository, DiscountService, CartIdentityInterceptor],
  exports: [DiscountService],
})
export class DiscountModule {}
