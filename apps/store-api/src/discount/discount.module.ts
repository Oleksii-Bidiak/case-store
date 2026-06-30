import { Module } from '@nestjs/common';
import { CartModule } from '../cart';
import { DiscountRepository } from './discount.repository';
import { DiscountService } from './discount.service';
import { DiscountController } from './discount.controller';
import { AdminDiscountController } from './admin-discount.controller';

/**
 * DiscountModule — promo-code validation, calculation, redemption, and admin
 * management. Imports {@link CartModule} for the preview path (reads the
 * caller's cart subtotal server-side). Exports {@link DiscountService} so
 * {@link OrderModule} can redeem inside the order-creation transaction.
 */
@Module({
  imports: [CartModule],
  controllers: [DiscountController, AdminDiscountController],
  providers: [DiscountRepository, DiscountService],
  exports: [DiscountService],
})
export class DiscountModule {}
