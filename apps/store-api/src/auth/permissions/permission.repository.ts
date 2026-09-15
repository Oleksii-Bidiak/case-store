import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { isKnownPermission } from './permission.catalog';

/**
 * Everything the permission guard needs about the caller, resolved on every
 * admin request (TASK-334, extended to the per-person model in TASK-475).
 *
 * `email` is carried so the audit interceptor can denormalise it without a
 * second query — the actor lookup already happened, and an audit row that has
 * to re-read the user is an audit row that disappears when the account does.
 *
 * `isOwner` is the level, not a role: exactly one row in the whole shop carries
 * it, and it is the only thing `@OwnerOnly` consults (plan 178, decision 1).
 *
 * `permissions` is this PERSON's own set, not their role's. A `Set` rather than
 * an array because the guard asks exactly one membership question per request.
 */
export interface PermissionActor {
  id: string;
  email: string;
  role: UserRole;
  isOwner: boolean;
  permissions: ReadonlySet<string>;
}

@Injectable()
export class PermissionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve the CURRENT state of the caller behind an access token (TASK-334).
   *
   * Returns null for an account that is missing, banned (`isActive: false`) or
   * tombstoned (`deletedAt`) — the guard treats all three as "no rights at all",
   * which is what makes a dismissal effective on the very next request instead
   * of up to 15 minutes later when the access token happens to expire.
   *
   * DELIBERATELY NOT CACHED, and since TASK-475 nothing around it is either.
   * This is one indexed read on admin traffic only (a handful of requests per
   * minute, not the storefront), and the alternative — a window in which a fired
   * employee still holds their old access — is precisely the hole this whole
   * design exists to close.
   *
   * The grants now ride along on that same read: one `include`, one round trip,
   * the person and their rights resolved together. That is what retired the
   * Redis matrix cache, and with it every invalidation hook a future contributor
   * could forget to call. Caching the old role→permission matrix was defensible
   * because editing the matrix evicted the key explicitly; there was never an
   * equivalent hook on "somebody edited a user row", and per-person rights turn
   * every grant change into exactly that. Now there is nothing to evict:
   * revoking a permission is refused on the target's next request because the
   * next request reads the row that is no longer there (invariant 8).
   *
   * Rows naming a permission the code catalogue no longer declares are dropped
   * here rather than at the guard. A renamed or deleted key leaves stale rows
   * behind, and honouring one would grant a capability nobody can see on the
   * granting screen.
   */
  async findActor(userId: string): Promise<PermissionActor | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true, deletedAt: null },
      select: {
        id: true,
        email: true,
        role: true,
        isOwner: true,
        permissions: { select: { permission: true } },
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isOwner: user.isOwner,
      permissions: new Set(
        user.permissions.map((row) => row.permission).filter((key) => isKnownPermission(key)),
      ),
    };
  }
}
