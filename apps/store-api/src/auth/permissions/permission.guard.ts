import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionService } from './permission.service';
import { OWNER_ONLY_KEY, REQUIRE_PERMISSION_KEY } from './require-permission.decorator';
import type { PermissionActor } from './permission.repository';

/**
 * The single message every refusal from this guard uses.
 *
 * Deliberately identical for "you are a shopper", "you are a manager without
 * this permission" and "this route is owner-only". Naming the missing
 * permission would hand an authenticated attacker a map of the admin surface
 * one 403 at a time; the specific reason is logged server-side instead, where
 * an operator can see it and a caller cannot. Also matches the old
 * `AdminGuard` message exactly, so the 43-site migration changed no contract.
 */
const ACCESS_DENIED_MESSAGE = 'Admin access required';

/** Shape the guard hangs on the request for downstream consumers. */
export interface RequestWithActor {
  user?: { id?: string; role?: string };
  /** The DB-resolved actor, reused by AuditInterceptor (TASK-318). */
  permissionActor?: PermissionActor;
}

/**
 * PermissionGuard — the one choke point for admin authorisation (TASK-334,
 * rewritten onto the three-level access model in TASK-475).
 *
 * THE DECISION ORDER IS THE WHOLE DESIGN, and it runs exactly like this:
 *
 *   1. A valid JWT — inherited from {@link JwtAuthGuard}: 401 on a missing or
 *      invalid token, and `request.user` populated on success.
 *   2. The route's requirement, read from `@RequirePermission()` / `@OwnerOnly()`.
 *   3. FAIL CLOSED if the route declares neither.
 *   4. The caller's CURRENT level and rights, read from the DATABASE in one go.
 *   5. `isOwner` → allowed, whatever the route asks for.
 *   6. `@OwnerOnly` → refused for everybody else.
 *   7. `role === ADMIN` → allowed, without a single granted row.
 *   8. Otherwise: does this person hold this permission?
 *
 * STEPS 6 AND 7 ARE IN THAT ORDER ON PURPOSE. An admin passes every permission
 * that exists, so the only thing between a deputy and the owner's reserve — the
 * four doors that decide who runs the shop: changing a role, setting a password,
 * deactivating and deleting an account — is that `@OwnerOnly` is consulted
 * first. Swap them and every test about admins doing admin things still passes
 * while a deputy quietly gains the power to lock the owner out of their own shop.
 *
 * WHY STEP 4 IS A DATABASE READ: the role in the JWT is a 15-minute-old
 * snapshot. Trusting it means a dismissed employee — demoted, deactivated, or
 * deleted — keeps their full rights until their access token happens to expire
 * (edge case E-06). One indexed lookup on admin traffic is the price of that
 * being false. Since TASK-475 the caller's own grants arrive on that same read,
 * so there is no cache anywhere in this path and a revoked permission is refused
 * on the very next request (plan 181, invariant 8).
 *
 * FAIL-CLOSED (step 3): a route wearing this guard with NEITHER annotation is
 * refused, not allowed. That is the shape a mistake takes — someone adds an
 * endpoint to an already-guarded admin controller and forgets the decorator —
 * and the dangerous direction of that mistake is "silently public".
 * `permission.catalog.spec.ts` turns the same mistake into a failing build so it
 * never reaches runtime.
 */
@Injectable()
export class PermissionGuard extends JwtAuthGuard {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionService,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(PermissionGuard.name);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Authenticate first: 401 on a missing/invalid token, and request.user set.
    const authenticated = (await super.canActivate(context)) as boolean;
    if (!authenticated) {
      return false;
    }

    const request = context.switchToHttp().getRequest<RequestWithActor>();
    const userId = request.user?.id;
    if (!userId) {
      throw new ForbiddenException(ACCESS_DENIED_MESSAGE);
    }

    const { ownerOnly, permission } = this.resolveRequirement(context);

    if (!ownerOnly && !permission) {
      // An unannotated guarded route. Refused rather than allowed — see the
      // class docblock. Logged at error because this is a code defect, not a
      // user error, and it should page someone rather than confuse a manager.
      this.logger.error(
        {
          event: 'rbac.routeUnannotated',
          controller: context.getClass().name,
          handler: context.getHandler().name,
        },
        'Route is guarded by PermissionGuard but declares neither @RequirePermission nor @OwnerOnly — refusing',
      );
      throw new ForbiddenException(ACCESS_DENIED_MESSAGE);
    }

    const actor = await this.permissionService.findActor(userId);

    // No live row: deleted, banned, or an id from a token that outlived its
    // account. All three mean no rights, effective immediately.
    if (!actor) {
      this.deny(context, userId, 'actor-not-active');
    }

    // Expose the DB-resolved actor so AuditInterceptor does not repeat the read
    // (and so the audit row records who the caller REALLY is, not who their
    // token claimed).
    request.permissionActor = actor;

    // Level 1 — the owner. Everything, including the reserve.
    if (actor.isOwner) {
      return true;
    }

    // The reserve, closed to everyone else. BEFORE the admin bypass below: this
    // one line is what stops a deputy reaching the four doors that decide who
    // runs the shop.
    if (ownerOnly) {
      this.deny(context, userId, 'owner-only');
    }

    // Level 2 — a deputy admin. Every permission, no rows required. They exist
    // so the shop keeps running while the owner is away, which it cannot do if
    // somebody has to tick 38 boxes first.
    if (actor.role === UserRole.ADMIN) {
      return true;
    }

    // Level 3 — everyone else holds exactly what they were personally granted.
    // `!permission` is unreachable (the fail-closed branch above already threw),
    // but expressing it here is what lets the compiler — not a `!` assertion —
    // guarantee a permission key is present.
    if (!permission) {
      this.deny(context, userId, 'unannotated');
    }

    if (!this.permissionService.actorHasPermission(actor, permission)) {
      this.deny(context, userId, `missing:${permission}`);
    }

    return true;
  }

  /**
   * Which requirement applies to this handler.
   *
   * A handler-level annotation of EITHER kind fully overrides the class-level
   * one — otherwise a controller-wide `@RequirePermission('orders:read')` would
   * leak through onto a method marked `@OwnerOnly()` and the two would have to
   * be reconciled at every call site. `Reflector.getAllAndOverride` cannot
   * express that on its own because the two keys are independent.
   */
  private resolveRequirement(context: ExecutionContext): {
    ownerOnly: boolean;
    permission?: string;
  } {
    const handler = context.getHandler();
    const controller = context.getClass();

    const handlerOwnerOnly = this.reflector.get<boolean | undefined>(OWNER_ONLY_KEY, handler);
    const handlerPermission = this.reflector.get<string | undefined>(
      REQUIRE_PERMISSION_KEY,
      handler,
    );

    if (handlerOwnerOnly || handlerPermission) {
      return { ownerOnly: Boolean(handlerOwnerOnly), permission: handlerPermission };
    }

    return {
      ownerOnly: Boolean(this.reflector.get<boolean | undefined>(OWNER_ONLY_KEY, controller)),
      permission: this.reflector.get<string | undefined>(REQUIRE_PERMISSION_KEY, controller),
    };
  }

  /** Log the real reason server-side, tell the caller nothing. Never returns. */
  private deny(context: ExecutionContext, userId: string, reason: string): never {
    this.logger.warn(
      {
        event: 'rbac.denied',
        userId,
        reason,
        controller: context.getClass().name,
        handler: context.getHandler().name,
      },
      'Admin request refused',
    );
    throw new ForbiddenException(ACCESS_DENIED_MESSAGE);
  }
}
