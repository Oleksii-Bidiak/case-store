import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WishlistRepository } from './wishlist.repository';
import { WishlistService } from './wishlist.service';
import { WishlistController } from './wishlist.controller';
import { WishlistIdentityInterceptor } from './interceptors';

@Module({
  imports: [ConfigModule],
  controllers: [WishlistController],
  providers: [WishlistRepository, WishlistService, WishlistIdentityInterceptor],
  exports: [WishlistService, WishlistRepository],
})
export class WishlistModule {}
