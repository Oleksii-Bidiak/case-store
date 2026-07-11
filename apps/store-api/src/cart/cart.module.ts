import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CartRepository } from './cart.repository';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { CartIdentityInterceptor } from './interceptors';
import { AddonServiceModule } from '../addon-service';

@Module({
  // AddonServiceModule supplies AddonApplicabilityResolver, which enriches every
  // cart read with each line's applicable add-ons and validates a selection
  // before it is written (TASK-174).
  imports: [ConfigModule, AddonServiceModule],
  controllers: [CartController],
  providers: [CartRepository, CartService, CartIdentityInterceptor],
  exports: [CartService, CartRepository],
})
export class CartModule {}
