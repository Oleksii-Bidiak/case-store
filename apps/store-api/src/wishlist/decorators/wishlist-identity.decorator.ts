import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { ResolvedWishlistIdentity } from '../wishlist-identity.types';

/**
 * Parameter decorator that returns the resolved wishlist identity for the
 * request. The identity is set on `request.wishlistIdentity` by the
 * WishlistIdentityInterceptor.
 *
 * Usage: `@WishlistIdentity() identity: ResolvedWishlistIdentity`
 */
export const WishlistIdentity = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ResolvedWishlistIdentity => {
    const request = ctx.switchToHttp().getRequest<{ wishlistIdentity: ResolvedWishlistIdentity }>();
    return request.wishlistIdentity;
  },
);
