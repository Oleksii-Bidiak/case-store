import { Injectable, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * AdminGuard — RETIRED (TASK-334). Use `PermissionGuard` + `@RequirePermission()`
 * / `@OwnerOnly()` instead.
 *
 * @deprecated Every one of its 43 call sites was migrated to `PermissionGuard`,
 * and `permission.catalog.spec.ts` fails the build if a controller starts using
 * this again. The class is kept only so an in-flight branch that still imports
 * it does not fail to compile at merge time — reaching for it in new code
 * reinstates the hardcoded `role !== ADMIN` check, which locks every MANAGER out
 * of a route the permission matrix says they hold. That failure surfaces as a
 * confused support ticket months later, not as a red test.
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
