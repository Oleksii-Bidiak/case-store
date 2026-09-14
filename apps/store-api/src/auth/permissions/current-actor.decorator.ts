import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { PermissionActor } from './permission.repository';
import type { RequestWithActor } from './permission.guard';

/**
 * The caller as the DATABASE currently sees them (TASK-476).
 *
 * `PermissionGuard` resolves the actor on every request it guards and hangs it on
 * the request; this decorator hands that same object to the handler. Nothing is
 * re-read, so the level a route enforces is provably the level the guard checked.
 *
 * WHY NOT `@CurrentUser()`. That one reads `request.user`, which is the JWT
 * payload: a 15-minute-old snapshot of the role, with no `isOwner` in it at all.
 * A level rule fed from the token would let a just-demoted admin keep managing
 * managers until their access token happened to expire — edge case E-06, and the
 * reason the guard reads the database in the first place.
 *
 * Throws rather than returning undefined when the actor is missing, because the
 * only way that happens is a route using this decorator WITHOUT `PermissionGuard`.
 * That is a code defect whose silent form — `actor` undefined, level comparison
 * against nothing — fails open.
 */
export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PermissionActor => {
    const request = ctx.switchToHttp().getRequest<RequestWithActor>();
    const actor = request.permissionActor;

    if (!actor) {
      throw new ForbiddenException('Admin access required');
    }

    return actor;
  },
);
