import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CartRepository } from './cart.repository';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { CartIdentityInterceptor } from './interceptors';

@Module({
  imports: [ConfigModule],
  controllers: [CartController],
  providers: [CartRepository, CartService, CartIdentityInterceptor],
  exports: [CartService],
})
export class CartModule {}
