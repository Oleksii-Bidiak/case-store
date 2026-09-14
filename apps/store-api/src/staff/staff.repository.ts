import { Injectable } from '@nestjs/common';
import { Prisma, User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma';

/** The roles that make an account STAFF. Customers are the other list. */
export const STAFF_ROLES: readonly UserRole[] = [UserRole.ADMIN, UserRole.MANAGER];

/** Filters for the staff list. Mirrors `FindAllParams` on the customer side. */
export interface FindStaffParams {
  page: number;
  limit: number;
  role?: UserRole;
  isActive?: boolean;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** Fields accepted when provisioning a staff account. Already hashed — a
 *  repository that took a plaintext password would be one refactor away from
 *  storing it. */
export interface CreateStaffUserInput {
  email: string;
  passwordHash: string;
  role: UserRole;
  firstName?: string;
  lastName?: string;
}

/** A staff row plus the two things the «Персонал» screen shows next to it. */
export interface StaffAccount {
  user: User;
  permissionCount: number;
  /** Newest `RefreshToken.createdAt` — see `StaffUserEntity.lastSeenAt`. */
  lastSeenAt: Date | null;
}

export interface PaginatedStaffResult {
  staff: StaffAccount[];
  total: number;
}

/**
 * Data access for the «Персонал» section (TASK-476, plan 181, decision 3).
 *
 * THE SCOPE IS IN THE QUERY, NOT IN A PARAMETER. Every read here hard-filters
 * `role IN (ADMIN, MANAGER)`. Before this module the same rows were reachable
 * through `/api/users` under `customers:read`, so a manager hired to phone
 * customers could list every service account and — because deactivation sat
 * under `customers:write` — switch one off. Making "staff" a query the caller
 * could ask for would rebuild that door with a nicer name.
 *
 * WHAT LIVES HERE AND WHAT STAYS IN `UserRepository`. This file owns the staff
 * VIEW (the scoped reads) and the two writes that exist only for staff —
 * provisioning an account and changing a role, both removed from `/api/users` by
 * this task. Row-lifecycle writes that BOTH surfaces perform — deactivate,
 * activate, soft-delete — deliberately stay in `UserRepository`, which remains
 * the single place that mutates a user row's lifecycle. Two repositories each
 * soft-deleting a user is exactly how one of them ends up forgetting to mangle
 * the email.
 */
@Injectable()
export class StaffRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of staff accounts, newest first by default.
   *
   * The counts and timestamps are two extra grouped reads over the page's ids
   * rather than a correlated sub-select per row: the page is at most 100 rows, so
   * this is three round trips regardless of page size instead of 1 + 2N.
   */
  async findAll(params: FindStaffParams): Promise<PaginatedStaffResult> {
    const { page, limit, role, isActive, search } = params;
    const skip = (page - 1) * limit;

    const ALLOWED_SORT: Record<string, string> = { createdAt: 'createdAt', email: 'email' };
    const sortField = ALLOWED_SORT[params.sortBy ?? 'createdAt'] ?? 'createdAt';
    const sortOrder = params.sortOrder ?? 'desc';

    // `id` last so the sort is total — `createdAt` is not unique (a seed batch
    // writes many rows on one timestamp) and a tie spanning a page boundary hands
    // back the same account twice while another never appears (TASK-356).
    const orderBy: Prisma.UserOrderByWithRelationInput[] = [
      { [sortField]: sortOrder },
      { id: 'asc' },
    ];

    const and: Prisma.UserWhereInput[] = [{ role: { in: [...STAFF_ROLES] } }];

    if (role !== undefined) {
      // Narrows within staff. Asking for CUSTOMER contradicts the scope above and
      // returns nothing, which is the honest answer.
      and.push({ role });
    }
    if (isActive !== undefined) {
      and.push({ isActive });
    }

    // Multi-token search (TASK-406): each token is ORed across the three columns
    // and the tokens are ANDed, so «Olena Kovalenko» matches across two columns.
    for (const token of search?.trim().split(/\s+/).filter(Boolean) ?? []) {
      and.push({
        OR: [
          { email: { contains: token, mode: 'insensitive' } },
          { firstName: { contains: token, mode: 'insensitive' } },
          { lastName: { contains: token, mode: 'insensitive' } },
        ],
      });
    }

    const where: Prisma.UserWhereInput = { deletedAt: null, AND: and };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({ where, skip, take: limit, orderBy }),
      this.prisma.user.count({ where }),
    ]);

    const extras = await this.loadExtras(users.map((user) => user.id));

    return {
      staff: users.map((user) => ({
        user,
        permissionCount: extras.permissionCounts.get(user.id) ?? 0,
        lastSeenAt: extras.lastSeenAt.get(user.id) ?? null,
      })),
      total,
    };
  }

  /**
   * One staff account by id, or null.
   *
   * Null for a customer id as well as for a missing one, and the service turns
   * both into the same 404. That is the point: `/api/admin/staff/:id` must not
   * become a way to read a shopper's row under `staff:read`.
   */
  async findStaffById(id: string): Promise<StaffAccount | null> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null, role: { in: [...STAFF_ROLES] } },
    });

    if (!user) {
      return null;
    }

    const extras = await this.loadExtras([user.id]);

    return {
      user,
      permissionCount: extras.permissionCounts.get(user.id) ?? 0,
      lastSeenAt: extras.lastSeenAt.get(user.id) ?? null,
    };
  }

  /**
   * Provision a staff account (TASK-333/317).
   *
   * `emailVerifiedAt` is left null: somebody typed this address, nobody has proven
   * it, and stamping it verified here would launder an assumption into a fact.
   * The employee proves it through the normal TASK-342 flow.
   */
  create(data: CreateStaffUserInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  /**
   * Change an account's role. Deliberately dumb about policy — callers MUST have
   * run `assertMayManage` and `assertMayAssign` first, which `StaffService` does
   * and `staff.service.spec.ts` proves.
   *
   * Takes any live account, not just a staff one: promoting an existing customer
   * is a real flow and this is the write that performs it.
   */
  updateRole(id: string, role: UserRole): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { role } });
  }

  /**
   * Move `isOwner` from one account to another — the ONE write in this codebase
   * that changes who owns the shop (TASK-478, plan 181, invariant 1).
   *
   * ── THE WRITE ORDER IS THE CONTRACT, NOT A STYLE CHOICE ─────────────────────
   *
   * `users_single_owner_key` is a PARTIAL unique index: `ON users(is_owner) WHERE
   * is_owner = true`. Postgres enforces a unique index IMMEDIATELY — statement by
   * statement — not at COMMIT. So wrapping both updates in a transaction does NOT
   * on its own make the pair legal: the instant between the two statements is
   * still checked.
   *
   * Clear first, then set, and that instant holds ZERO owners, which a unique
   * index has nothing to say about. Set first and it would hold TWO, and the very
   * first statement is rejected with `P2002` — the transfer would never succeed at
   * all, for anybody, in any shop. Swapping these two lines is therefore not a
   * subtle race; it is a feature that never works. `staff.repository.spec.ts` runs
   * the naive order against a fake index and `access-model-backfill.int-spec.ts`
   * runs it against the real one, so the failure surfaces as a red test rather
   * than as an owner who cannot hand over.
   *
   * ── WHAT THE TRANSACTION BUYS THAT THE INDEX CANNOT ─────────────────────────
   *
   * The index guarantees "never two owners". It says nothing about ZERO owners —
   * `is_owner = false` everywhere satisfies it perfectly, and that is exactly the
   * state the first statement creates. If the second statement then failed outside
   * a transaction (the target was deleted in another tab, the connection dropped),
   * the shop would be left with no owner at all and no route that can appoint one,
   * because appointing an owner is the thing only an owner may do. The transaction
   * is what makes that window unobservable and unreachable: either both writes
   * land or neither does.
   *
   * Deliberately dumb about policy, like {@link updateRole}: who may call this,
   * whether the target is live staff, and whether the caller re-entered their
   * password are all `StaffService.transferOwnership`'s job.
   *
   * @param fromUserId the current owner — cleared FIRST
   * @param toUserId the incoming owner — set SECOND
   */
  transferOwnership(
    fromUserId: string,
    toUserId: string,
  ): Promise<{ outgoing: User; incoming: User }> {
    return this.prisma.$transaction(async (tx) => {
      // 1. The shop momentarily has no owner. Only inside this transaction.
      const outgoing = await tx.user.update({
        where: { id: fromUserId },
        data: { isOwner: false },
      });

      // 2. …and now exactly one, which is the only state anybody else can see.
      const incoming = await tx.user.update({
        where: { id: toUserId },
        data: { isOwner: true },
      });

      return { outgoing, incoming };
    });
  }

  /** Permission counts and last-session timestamps for a page of accounts. */
  private async loadExtras(userIds: string[]): Promise<{
    permissionCounts: Map<string, number>;
    lastSeenAt: Map<string, Date>;
  }> {
    if (userIds.length === 0) {
      return { permissionCounts: new Map(), lastSeenAt: new Map() };
    }

    const [permissions, sessions] = await Promise.all([
      this.prisma.userPermission.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds } },
        _count: { _all: true },
      }),
      this.prisma.refreshToken.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds } },
        _max: { createdAt: true },
      }),
    ]);

    return {
      permissionCounts: new Map(permissions.map((row) => [row.userId, row._count._all])),
      lastSeenAt: new Map(
        sessions
          .filter((row): row is typeof row & { _max: { createdAt: Date } } =>
            Boolean(row._max.createdAt),
          )
          .map((row) => [row.userId, row._max.createdAt]),
      ),
    };
  }
}
