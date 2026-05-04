import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * Guard that checks whether the authenticated user has the required role(s).
 *
 * Works in conjunction with the @Roles() decorator:
 * - If no @Roles() metadata is set, the endpoint is public (all authenticated users allowed).
 * - If @Roles('ADMIN') is set, only users with role 'ADMIN' can access the endpoint.
 * - If the user's role is not in the allowed roles, a 403 Forbidden is thrown.
 *
 * Must be used AFTER JwtAuthGuard (or any guard that sets request.user).
 *
 * Usage: @UseGuards(JwtAuthGuard, RolesGuard)
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get the roles required by the handler or class (if any)
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no roles are required, the endpoint is accessible to any authenticated user
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // Get the authenticated user from the request
    const { user } = context.switchToHttp().getRequest<{ user: { id: string; role: string } }>();

    // If no user is present, deny access
    if (!user) {
      throw new ForbiddenException('Access denied');
    }

    // Check if the user's role is in the required roles
    const hasRole = requiredRoles.includes(user.role);

    if (!hasRole) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
