import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Custom parameter decorator that extracts the authenticated user from the request.
 *
 * The user object is set on request.user by the JWT strategies
 * (JwtAccessStrategy or JwtRefreshStrategy) after successful validation.
 *
 * Usage:
 *   @CurrentUser()           → returns the full user object { id, role }
 *   @CurrentUser('id')       → returns only the user ID
 *   @CurrentUser('role')     → returns only the user role
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user: Record<string, unknown> }>();
    const user = request.user;

    // If a specific property is requested, return only that property
    if (data) {
      return user?.[data];
    }

    // Otherwise return the full user object
    return user;
  },
);
