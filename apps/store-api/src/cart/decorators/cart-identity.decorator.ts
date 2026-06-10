import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { ResolvedCartIdentity } from '../cart-identity.types';

/**
 * Parameter decorator that returns the resolved cart identity for the request.
 *
 * The identity is set on `request.cartIdentity` by the CartIdentityInterceptor.
 *
 * Usage: `@CartIdentity() identity: ResolvedCartIdentity`
 */
export const CartIdentity = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ResolvedCartIdentity => {
    const request = ctx.switchToHttp().getRequest<{ cartIdentity: ResolvedCartIdentity }>();
    return request.cartIdentity;
  },
);
