import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Prisma, UserRole } from '@prisma/client';
import { AuditRepository, type FindAuditLogsParams } from './audit.repository';
import { AuditLogEntity } from './entities';
import { sanitizeForAudit } from './audit.sanitize';

/** One entry to record. Everything but `action` is optional — see the model. */
export interface RecordAuditParams {
  /** Who. Omitted for system actions (cron, payment callback). */
  actorId?: string | null;
  /** Pre-resolved actor identity — skips the lookup when the caller already has it. */
  actorEmail?: string | null;
  actorRole?: UserRole | null;
  /** Verb-shaped and stable, e.g. `product.update`. */
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  summary?: string | null;
  /** Changed fields only. Sanitised again here — never trust the caller. */
  diff?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly repository: AuditRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuditService.name);
  }

  /**
   * Write one audit entry (TASK-318).
   *
   * NEVER THROWS. The mutation this describes has already committed by the time
   * we get here; letting a failed log write turn a successful price change into
   * a 500 would mean the operator retries an action that already happened. The
   * failure is logged at error level instead, where an operator can alert on it
   * — a silently empty audit log is its own incident, and this is the line that
   * makes it visible.
   *
   * `diff` is sanitised here even when the caller already sanitised it: this is
   * the last line before the row is written, and "the caller definitely did it"
   * is how secrets end up in logs.
   */
  async record(params: RecordAuditParams): Promise<void> {
    try {
      let actorEmail = params.actorEmail ?? null;
      let actorRole = params.actorRole ?? null;

      if (params.actorId && (!actorEmail || !actorRole)) {
        const snapshot = await this.repository.findActorSnapshot(params.actorId);
        actorEmail = actorEmail ?? snapshot?.email ?? null;
        actorRole = actorRole ?? snapshot?.role ?? null;
      }

      const diff = sanitizeForAudit(params.diff);

      await this.repository.create({
        actorId: params.actorId ?? null,
        actorEmail,
        actorRole,
        action: params.action,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        summary: params.summary ?? null,
        diff: diff === undefined ? undefined : (diff as Prisma.InputJsonValue),
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
      });
    } catch (err) {
      this.logger.error(
        { event: 'audit.writeFailed', action: params.action, err },
        'Failed to write audit log entry',
      );
    }
  }

  /** Paginated read for the admin log viewer. */
  async findMany(params: FindAuditLogsParams): Promise<{
    data: AuditLogEntity[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const { entries, total } = await this.repository.findMany(params);

    return {
      data: entries.map((entry) => AuditLogEntity.fromPrisma(entry)),
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }
}
