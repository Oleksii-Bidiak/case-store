import { Injectable } from '@nestjs/common';
import { AuditLog, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma';
import { AUDIT_LOG_SORT_FIELDS } from './dto/audit-log-query.dto';

/** Row shape written to `audit_log`. Every field except `action` is optional —
 *  a system action has no actor, a login has no entity, a delete has no diff. */
export interface CreateAuditLogInput {
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: UserRole | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  summary?: string | null;
  diff?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
}

/** Filters for the admin log viewer. */
export interface FindAuditLogsParams {
  page: number;
  limit: number;
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Translate the requested sort into a Prisma `orderBy` (TASK-356).
 *
 * The unknown-field fallback duplicates the DTO's `@IsIn` on purpose: the DTO
 * guards the HTTP boundary, this guards every other caller, and a `sortBy`
 * string reaching Prisma unchecked is a query-shape injection.
 *
 * The trailing keys are what make paging honest. `action` has a few dozen
 * distinct values across a log with millions of rows, so under LIMIT/OFFSET
 * nearly every page boundary falls inside a tie group — and within a tie
 * Postgres promises no order, so the same entry can show up on two pages while
 * another is skipped entirely. On an append-only record of who did what, a row
 * that silently fails to appear is the worst failure this file has. `createdAt`
 * breaks the tie (an actor's entries still read as a timeline), then `id`,
 * because `createdAt` is not unique either: one request writes several entries
 * within the same millisecond.
 *
 * Note the cost: only `createdAt` and `(actorId, createdAt)` are indexed, so
 * sorting by `actorEmail` or `action` is a full sort of the filtered set. That
 * is acceptable for an owner-only diagnostic screen that is nearly always
 * filtered first; it needs an index before the log reaches millions of rows.
 */
function buildAuditOrderBy(
  sortBy: string | undefined,
  sortOrder: 'asc' | 'desc' = 'desc',
): Prisma.AuditLogOrderByWithRelationInput[] {
  const field = (AUDIT_LOG_SORT_FIELDS as readonly string[]).includes(sortBy ?? '')
    ? (sortBy as (typeof AUDIT_LOG_SORT_FIELDS)[number])
    : 'createdAt';

  return [
    { [field]: sortOrder },
    ...(field === 'createdAt' ? [] : [{ createdAt: 'desc' as const }]),
    { id: 'asc' },
  ];
}

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateAuditLogInput): Promise<AuditLog> {
    return this.prisma.auditLog.create({ data: input });
  }

  /**
   * The actor's email and role at the moment of the action (TASK-318).
   *
   * Denormalised into the row rather than joined at read time because
   * `AuditLog.actorId` deliberately carries NO foreign key: system actions
   * (payment callbacks, cron) have no user, and the log must survive the
   * deletion of the account it describes. A join would turn "the admin who did
   * this has since been deleted" into a blank row — losing exactly the entry
   * someone would be looking for.
   *
   * Reads the user directly rather than through PermissionService: audit must
   * not depend on the auth module, or the two form an import cycle. It also
   * ignores `isActive`/`deletedAt` on purpose — recording who a now-banned
   * account was is the point.
   */
  async findActorSnapshot(userId: string): Promise<{ email: string; role: UserRole } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, originalEmail: true, role: true },
    });

    if (!user) {
      return null;
    }

    // A soft-deleted user's `email` is mangled to `deleted:<id>:<address>`;
    // `originalEmail` holds the readable one.
    return { email: user.originalEmail ?? user.email, role: user.role };
  }

  async findMany(params: FindAuditLogsParams): Promise<{ entries: AuditLog[]; total: number }> {
    const { page, limit, actorId, action, entityType, entityId, from, to } = params;

    const where: Prisma.AuditLogWhereInput = {};
    if (actorId) where.actorId = actorId;
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (from || to) {
      where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    }

    const [entries, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: buildAuditOrderBy(params.sortBy, params.sortOrder),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { entries, total };
  }
}
