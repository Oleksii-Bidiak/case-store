import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard that reads the JWT access token if present, but does NOT reject the
 * request when it is missing, invalid, or expired. In those cases
 * `request.user` is left as `null` and the request is treated as a guest.
 *
 * Used by the Wishlist controller so both authenticated users and anonymous
 * visitors can access their wishlist. Parallel copy of the cart guard (TASK-076
 * keeps the wishlist module self-contained during Wave 2).
 *
 * Usage: @UseGuards(OptionalJwtAuthGuard)
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt-access') {
  handleRequest<TUser>(_err: unknown, user: TUser): TUser | null {
    // Never throw — a missing/invalid token simply means "guest".
    return user ?? null;
  }
}
