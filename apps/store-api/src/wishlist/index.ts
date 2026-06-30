// Wishlist Module — public API
export { WishlistModule } from './wishlist.module';
export { WishlistService } from './wishlist.service';
export { WishlistController } from './wishlist.controller';
export { WishlistRepository, WishlistWithItems } from './wishlist.repository';
export { WishlistEntity, WishlistItemEntity } from './entities';
export { AddToWishlistDto } from './dto';
export { WISHLIST_TOKEN_COOKIE } from './wishlist-identity.types';
export type { ResolvedWishlistIdentity } from './wishlist-identity.types';
