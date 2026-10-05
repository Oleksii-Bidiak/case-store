// Wishlist Module — public API
export { WishlistModule } from './wishlist.module';
export { WishlistService } from './wishlist.service';
export { WishlistRepository, type WishlistWithItems } from './wishlist.repository';
export { WishlistEntity, WishlistItemEntity } from './entities';
export { AddToWishlistDto } from './dto';
export { WISHLIST_TOKEN_COOKIE, buildWishlistTokenCookieOptions } from './wishlist-identity.types';
export type { ResolvedWishlistIdentity } from './wishlist-identity.types';
