import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { UserRole } from '@prisma/client';
import { PermissionRepository, type PermissionActor } from './permission.repository';
import { CacheService } from '../../cache';
import {
  PERMISSIONS,
  PERMISSION_ZONE_LABELS,
  isKnownPermission,
  type Permission,
} from './permission.catalog';

/** Cache key prefix for one role's resolved grant set. */
const ROLE_GRANTS_CACHE_PREFIX = 'rbac:role-grants:';

/**
 * How long a role's grant set may be served from cache (TASK-334).
 *
 * Short by design, but the TTL is the BACKSTOP, not the mechanism: every write
 * through {@link PermissionService.setRoleGrants} evicts the key explicitly, so
 * a revoked permission takes effect on the caller's very next request. The TTL
 * only bounds the damage if a write ever lands without going through this
 * service (a manual SQL fix, a restore from backup, a second app instance whose
 * Redis eviction failed).
 */
const DEFAULT_ROLE_GRANTS_TTL_SECONDS = 60;

/** The roles whose grants the matrix may contain — see {@link PermissionService}. */
const GRANTABLE_ROLES: readonly UserRole[] = [UserRole.MANAGER];

/** One role's row in the matrix, as the owner's editing screen sees it. */
export interface RoleGrantSet {
  role: UserRole;
  permissions: string[];
}

/** Everything the permission-matrix screen needs in one response. */
export interface PermissionMatrix {
  /** The code catalogue: every permission that exists, with its zone. */
  catalogue: ReadonlyArray<{ key: string; zone: string; label: string }>;
  /** Zone display order + Ukrainian labels. */
  zones: ReadonlyArray<{ zone: string; label: string }>;
  /** Which roles may be edited here (ADMIN is never one of them). */
  grantableRoles: readonly UserRole[];
  /** Current grants, one entry per grantable role. */
  grants: RoleGrantSet[];
}

/** What `GET /api/auth/me/permissions` tells the frontend about the caller. */
export interface EffectivePermissions {
  role: UserRole;
  /** True for ADMIN — the owner, who is never subject to the matrix. */
  isOwner: boolean;
  /** Every permission the caller currently holds. For an owner: the whole catalogue. */
  permissions: string[];
}

/**
 * Resolves who may do what (TASK-334).
 *
 * TWO HARD RULES, and everything else follows from them:
 *
 * 1. **Absence of a row means DENIED.** Never "unknown, so allow". Shipping a
 *    new admin section adds a permission to the code catalogue and no rows to
 *    the database, so it is granted to nobody until the owner grants it. The
 *    opposite default would silently hand every future feature to every
 *    existing MANAGER — a security regression delivered by a feature release,
 *    which is the hardest kind to notice.
 *
 * 2. **ADMIN is never subject to the matrix.** The owner always holds every
 *    permission, and the matrix cannot express an ADMIN row at all
 *    ({@link GRANTABLE_ROLES}). A matrix that could revoke the owner's own
 *    access is a lockout waiting to happen, and recovering from it means shell
 *    access to the production database.
 *
 * Grants are read from the DATABASE, never from the JWT. The role is baked into
 * a 15-minute access token, so a token-based check would leave a dismissed
 * employee with full rights for up to a quarter of an hour (edge case E-06).
 */
@Injectable()
export class PermissionService {
  private readonly ttlSeconds: number;

  constructor(
    private readonly repository: PermissionRepository,
    private readonly cache: CacheService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PermissionService.name);
    this.ttlSeconds = Number(
      this.config.get<number>('RBAC_PERMISSION_CACHE_TTL_SECONDS', DEFAULT_ROLE_GRANTS_TTL_SECONDS),
    );
  }

  /**
   * The current state of the caller, straight from the database. Null means "no
   * rights at all": no such user, banned, or soft-deleted.
   */
  findActor(userId: string): Promise<PermissionActor | null> {
    return this.repository.findActor(userId);
  }

  /**
   * Does `role` currently hold `permission`?
   *
   * ADMIN short-circuits to true without touching the database — rule 2 above.
   * CUSTOMER short-circuits to false: a shopper has no admin rights and never
   * gets a matrix row, so a lookup would only be a way for a future misedit to
   * grant one.
   */
  async roleHasPermission(role: UserRole, permission: string): Promise<boolean> {
    if (role === UserRole.ADMIN) {
      return true;
    }
    if (!GRANTABLE_ROLES.includes(role)) {
      return false;
    }

    const granted = await this.getRoleGrants(role);
    return granted.includes(permission);
  }

  /**
   * One role's granted permission keys, cached in Redis.
   *
   * Unknown keys are filtered out on the way through: a row naming a permission
   * that no longer exists in the code catalogue (renamed, deleted) is stale data
   * and must not be treated as a grant of anything. Filtering here rather than
   * at write time also covers rows that predate a rename.
   */
  async getRoleGrants(role: UserRole): Promise<string[]> {
    const cacheKey = `${ROLE_GRANTS_CACHE_PREFIX}${role}`;

    const cached = await this.cache.get<string[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const rows = await this.repository.findGrantedByRole(role);
    const granted = rows.map((row) => row.permission).filter((key) => isKnownPermission(key));

    await this.cache.set(cacheKey, granted, this.ttlSeconds);
    return granted;
  }

  /**
   * What the signed-in caller may do — the frontend's single source of truth
   * (`GET /api/auth/me/permissions`).
   *
   * Reads the role from the DATABASE, not from the token that carried the
   * request, for the same reason the guard does: a stale token must never be
   * able to talk the admin UI into rendering controls its owner no longer has.
   * A deactivated/deleted account resolves to CUSTOMER with no permissions,
   * matching what every guarded route would tell it anyway.
   */
  async getEffectivePermissions(userId: string): Promise<EffectivePermissions> {
    const actor = await this.repository.findActor(userId);

    if (!actor) {
      return { role: UserRole.CUSTOMER, isOwner: false, permissions: [] };
    }

    if (actor.role === UserRole.ADMIN) {
      return {
        role: UserRole.ADMIN,
        isOwner: true,
        permissions: PERMISSIONS.map((p) => p.key),
      };
    }

    if (!GRANTABLE_ROLES.includes(actor.role)) {
      return { role: actor.role, isOwner: false, permissions: [] };
    }

    return {
      role: actor.role,
      isOwner: false,
      permissions: await this.getRoleGrants(actor.role),
    };
  }

  /** The whole matrix plus the code catalogue, for the owner's editing screen. */
  async getMatrix(): Promise<PermissionMatrix> {
    const grants = await Promise.all(
      GRANTABLE_ROLES.map(async (role) => ({
        role,
        permissions: await this.getRoleGrants(role),
      })),
    );

    return {
      catalogue: PERMISSIONS.map((p) => ({ key: p.key, zone: p.zone, label: p.label })),
      zones: PERMISSION_ZONE_LABELS.map((z) => ({ zone: z.zone, label: z.label })),
      grantableRoles: GRANTABLE_ROLES,
      grants,
    };
  }

  /**
   * Replace one role's grants, then evict the cache (TASK-334).
   *
   * The eviction is what makes the acceptance criterion true — a revoked
   * permission is refused on the NEXT request, not up to 60 seconds later. It
   * runs AFTER the write commits: evicting first would leave a window in which a
   * concurrent request repopulates the cache from the pre-write rows and then
   * serves them for the full TTL, which is the failure the eviction was supposed
   * to prevent.
   *
   * @throws BadRequestException for an ungrantable role (notably ADMIN — rule 2)
   *         or a permission key that does not exist in the code catalogue. Both
   *         are silent-failure traps otherwise: the owner ticks a box, the screen
   *         says saved, and nothing changes.
   */
  async setRoleGrants(role: UserRole, permissions: string[]): Promise<string[]> {
    if (!GRANTABLE_ROLES.includes(role)) {
      throw new BadRequestException(
        `Role ${role} is not editable in the permission matrix. ` +
          'ADMIN always holds every permission — a matrix that could revoke it would lock the owner out of their own shop.',
      );
    }

    const unknown = permissions.filter((key) => !isKnownPermission(key));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown permission(s): ${unknown.join(', ')}`);
    }

    const unique = [...new Set(permissions)];
    await this.repository.replaceRoleGrants(role, unique);
    await this.cache.del(`${ROLE_GRANTS_CACHE_PREFIX}${role}`);

    this.logger.info(
      { event: 'rbac.matrixUpdated', role, count: unique.length },
      'Permission matrix updated',
    );

    return unique;
  }

  /** True when `key` names a permission that exists in the code catalogue. */
  isKnown(key: string): key is Permission {
    return isKnownPermission(key);
  }
}
