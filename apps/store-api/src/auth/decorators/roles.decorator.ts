import { SetMetadata } from '@nestjs/common';

/**
 * Decorator that sets the required role(s) for an endpoint or controller.
 *
 * Used in conjunction with RolesGuard to enforce role-based access control.
 *
 * Usage:
 *   @Roles('ADMIN')                    → only admins can access
 *   @Roles('ADMIN', 'CUSTOMER')        → admins and customers can access
 *   (no @Roles)                        → any authenticated user can access
 *
 * Must be paired with @UseGuards(JwtAuthGuard, RolesGuard).
 */
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
