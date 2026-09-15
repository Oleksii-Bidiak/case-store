import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PermissionRepository, type PermissionActor } from './permission.repository';
import { PERMISSIONS, isKnownPermission, type Permission } from './permission.catalog';

/** What `GET /api/auth/me/permissions` tells the frontend about the caller. */
export interface EffectivePermissions {
  role: UserRole;
  /** True for the ONE account that owns the shop (`User.isOwner`). */
  isOwner: boolean;
  /** True for any ADMIN, owner or deputy — i.e. "holds every permission". */
  isAdmin: boolean;
  /** Every permission the caller currently holds. For an admin: the whole catalogue. */
  permissions: string[];
}

/**
 * Resolves who may do what (TASK-334, rewritten per person in TASK-475).
 *
 * THREE LEVELS, and the guiding principle behind where the line falls is that
 * operational work is delegated while what changes WHO RUNS THE SHOP is not:
 *
 *   1. **Owner** — `User.isOwner`, exactly one row in the shop, enforced by a
 *      partial unique index rather than by application code. Holds every
 *      permission plus the reserve `@OwnerOnly` marks.
 *   2. **Admin** (deputy) — `role === ADMIN` without the flag. Holds every
 *      permission in the catalogue without a single row of their own, and never
 *      the reserve. That asymmetry is enforced in `PermissionGuard`, where the
 *      `@OwnerOnly` check runs BEFORE this level is consulted.
 *   3. **Manager** — holds exactly the `UserPermission` rows granted to them
 *      personally. Anyone else (a shopper) holds nothing.
 *
 * TWO HARD RULES SURVIVE THE REWRITE UNCHANGED:
 *
 *   **Absence of a row means DENIED.** Never "unknown, so allow". Shipping a new
 *   admin section adds a permission to the code catalogue and no rows to the
 *   database, so it is granted to nobody below admin level until somebody grants
 *   it. The opposite default would hand every future feature to every existing
 *   manager — a security regression delivered by a feature release, which is the
 *   hardest kind to notice.
 *
 *   **Rights are read from the DATABASE, never from the JWT.** The role is baked
 *   into a 15-minute access token, so a token-based check would leave a
 *   dismissed employee with full rights for up to a quarter of an hour (edge
 *   case E-06).
 *
 * WHAT IS GONE, AND WHY IT IS NOT COMING BACK: the role→permission matrix, its
 * Redis cache, its TTL and its invalidation. Rights now arrive on the same read
 * as the actor (`PermissionRepository.findActor`), so there is nothing left to
 * keep in sync — one fewer external call per admin request, and zero ways for a
 * revocation to be served stale.
 */
@Injectable()
export class PermissionService {
  constructor(private readonly repository: PermissionRepository) {}

  /**
   * The current state of the caller, straight from the database. Null means "no
   * rights at all": no such user, banned, or soft-deleted.
   */
  findActor(userId: string): Promise<PermissionActor | null> {
    return this.repository.findActor(userId);
  }

  /**
   * Does this ACTOR currently hold `permission`?
   *
   * Synchronous, and that is the point: everything the answer depends on already
   * arrived with the actor. There is no second query to await, no cache to
   * consult and therefore no window in which the answer is out of date.
   *
   * Note what this does NOT answer: whether the route is `@OwnerOnly`. A deputy
   * admin passes every permission here and must still be refused the owner's
   * reserve, so that check lives in the guard, ahead of this one.
   *
   * CUSTOMER short-circuits to false even when rows exist on the account.
   * Demoting a manager does not delete their rows — nothing in the system does —
   * so without this check a demotion would change the badge in the header and
   * nothing else.
   */
  actorHasPermission(actor: PermissionActor, permission: string): boolean {
    if (actor.isOwner) {
      return true;
    }
    if (actor.role === UserRole.ADMIN) {
      return true;
    }
    if (actor.role === UserRole.CUSTOMER) {
      return false;
    }

    return actor.permissions.has(permission);
  }

  /**
   * What the signed-in caller may do — the frontend's single source of truth
   * (`GET /api/auth/me/permissions`).
   *
   * Reads the level from the DATABASE, not from the token that carried the
   * request, for the same reason the guard does: a stale token must never be
   * able to talk the admin UI into rendering controls its holder no longer has.
   * A deactivated/deleted account resolves to CUSTOMER with no permissions,
   * matching what every guarded route would tell it anyway.
   *
   * `isOwner` and `isAdmin` are reported separately because they gate different
   * things on screen. An admin sees every operational control (they hold every
   * permission); only the owner sees the reserve. Collapsing the two — as the
   * frontend did while it inferred `isOwner` from `role === "ADMIN"` — offers a
   * deputy buttons whose only possible outcome is a 403.
   */
  async getEffectivePermissions(userId: string): Promise<EffectivePermissions> {
    const actor = await this.repository.findActor(userId);

    if (!actor) {
      return { role: UserRole.CUSTOMER, isOwner: false, isAdmin: false, permissions: [] };
    }

    const isAdmin = actor.role === UserRole.ADMIN;

    if (actor.isOwner || isAdmin) {
      return {
        role: actor.role,
        isOwner: actor.isOwner,
        isAdmin,
        permissions: PERMISSIONS.map((permission) => permission.key),
      };
    }

    if (actor.role === UserRole.CUSTOMER) {
      // Mirrors actorHasPermission: a demoted account's surviving rows are not
      // rights, so the panel must not render as though they were.
      return { role: actor.role, isOwner: false, isAdmin: false, permissions: [] };
    }

    return {
      role: actor.role,
      isOwner: false,
      isAdmin: false,
      permissions: [...actor.permissions].sort(),
    };
  }

  /** True when `key` names a permission that exists in the code catalogue. */
  isKnown(key: string): key is Permission {
    return isKnownPermission(key);
  }
}
