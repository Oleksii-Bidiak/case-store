import { Injectable } from '@nestjs/common';
import { RolePermission, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma';

/**
 * The subset of a `User` row the permission guard needs on every admin request
 * (TASK-334).
 *
 * `email` is carried so the audit interceptor can denormalise it without a
 * second query — the actor lookup already happened, and an audit row that has
 * to re-read the user is an audit row that disappears when the account does.
 */
export interface PermissionActor {
  id: string;
  email: string;
  role: UserRole;
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
   * Deliberately NOT cached, unlike the role→permission matrix. This is one
   * indexed primary-key read on admin traffic only (a handful of requests per
   * minute, not the storefront), and the alternative — a 60-second window in
   * which a fired employee still holds their old role — is precisely the hole
   * this whole design exists to close. Caching the matrix is safe because
   * editing the matrix invalidates it explicitly; there is no equivalent hook on
   * "someone edited a user row" that a future contributor could not forget.
   */
  async findActor(userId: string): Promise<PermissionActor | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true, deletedAt: null },
      select: { id: true, email: true, role: true },
    });

    return user ?? null;
  }

  /** Every granted row for one role. Rows with `allowed: false` are excluded —
   *  see {@link PermissionService} on why absence and denial are the same thing. */
  findGrantedByRole(role: UserRole): Promise<RolePermission[]> {
    return this.prisma.rolePermission.findMany({ where: { role, allowed: true } });
  }

  /** The whole matrix, for the owner's editing screen. */
  findAll(): Promise<RolePermission[]> {
    return this.prisma.rolePermission.findMany({
      orderBy: [{ role: 'asc' }, { permission: 'asc' }],
    });
  }

  /**
   * Replace one role's entire grant set in a single transaction (TASK-334).
   *
   * Delete-then-insert rather than a diff: the matrix is at most a few dozen
   * rows, and "the rows that exist are exactly the rows that are granted" is an
   * invariant worth more than the saved writes. A partial diff that failed
   * halfway would leave a role with a permission set nobody chose.
   */
  async replaceRoleGrants(role: UserRole, permissions: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { role } });

      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({ role, permission, allowed: true })),
          skipDuplicates: true,
        });
      }
    });
  }
}
