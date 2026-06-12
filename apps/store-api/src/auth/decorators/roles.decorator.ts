import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

/**
 * Metadata key under which the required roles are stored. Shared between the
 * @Roles() decorator and RolesGuard so the magic string lives in one place.
 */
export const ROLES_KEY = 'roles';

/**
 * Decorator that sets the required role(s) for an endpoint or controller.
 *
 * Used in conjunction with RolesGuard to enforce role-based access control.
 * Roles are typed against the Prisma `UserRole` enum so typos are caught at
 * compile time.
 *
 * Usage:
 *   @Roles(UserRole.ADMIN)                    → only admins can access
 *   @Roles(UserRole.ADMIN, UserRole.CUSTOMER) → admins and customers can access
 *   (no @Roles)                               → any authenticated user can access
 *
 * Must be paired with @UseGuards(JwtAuthGuard, RolesGuard) — or the AdminGuard
 * shorthand for the common ADMIN-only case.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
