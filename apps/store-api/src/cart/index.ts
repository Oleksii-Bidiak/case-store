// Cart Module — public API
export { CartModule } from './cart.module';
export { CartService } from './cart.service';
export {
  CartRepository,
  type AddToCartInput,
  type UpdateCartItemInput,
  type CartWithItems,
} from './cart.repository';
export { CartEntity, CartTotals, CartItemEntity } from './entities';
export { AddToCartDto, UpdateCartItemDto } from './dto';
// The cart-identity plumbing other routes reuse — checkout reads the same guest
// cart as `/cart`, and login merges it into the account (TASK-818).
export { OptionalJwtAuthGuard } from './guards';
export { CartIdentityInterceptor } from './interceptors';
export { CartIdentity } from './decorators';
export { CART_TOKEN_COOKIE, buildCartTokenCookieOptions } from './cart-identity.types';
export type { ResolvedCartIdentity } from './cart-identity.types';
