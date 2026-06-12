import { Injectable, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * AdminGuard — single guard enforcing an authenticated ADMIN user.
 *
 * Composes the two checks every admin endpoint needs into one decorator:
 *   1. A valid JWT access token — inherited from {@link JwtAuthGuard}, which
 *      throws 401 on a missing/invalid token and populates `request.user`.
 *   2. `role === ADMIN` — otherwise 403.
 *
 * Replaces the `@UseGuards(JwtAuthGuard, RolesGuard) + @Roles(UserRole.ADMIN)`
 * boilerplate with `@UseGuards(AdminGuard)`. The 401-before-403 ordering is
 * guaranteed because authentication runs first (super.canActivate).
 */
@Injectable()
export class AdminGuard extends JwtAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Authenticate first: throws 401 on a missing/invalid token and sets
    // request.user on success.
    const authenticated = (await super.canActivate(context)) as boolean;
    if (!authenticated) {
      return false;
    }

    const { user } = context.switchToHttp().getRequest<{ user?: { role?: UserRole } }>();
    if (user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
