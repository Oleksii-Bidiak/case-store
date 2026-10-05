import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CartRepository } from './cart.repository';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { GuestCartCleanupService } from './guest-cart-cleanup.service';
import { CartIdentityInterceptor } from './interceptors';
import { AddonServiceModule } from '../addon-service';

@Module({
  // AddonServiceModule supplies AddonApplicabilityResolver, which enriches every
  // cart read with each line's applicable add-ons and validates a selection
  // before it is written (TASK-174).
  imports: [ConfigModule, AddonServiceModule],
  controllers: [CartController],
  // GuestCartCleanupService sweeps empty guest carts daily (TASK-776).
  providers: [CartRepository, CartService, CartIdentityInterceptor, GuestCartCleanupService],
  // CartRepository stays private to the module (TASK-827): OrderModule, its last
  // outside consumer, now loads the checkout cart via CartService.
  exports: [CartService],
})
export class CartModule {}
