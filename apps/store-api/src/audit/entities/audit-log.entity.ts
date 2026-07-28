import { ApiProperty } from '@nestjs/swagger';
import { AuditLog, UserRole } from '@prisma/client';

/**
 * One row of the action log as the admin UI reads it (TASK-318).
 *
 * `actorEmail`/`actorRole` are the DENORMALISED values captured at the time of
 * the action, not a live join — so an entry still names who did it after that
 * account has been deleted, which is exactly when it matters most.
 */
export class AuditLogEntity {
  @ApiProperty({ example: '5f1c…' })
  id!: string;

  @ApiProperty({ example: '5f1c…', nullable: true, description: 'Null for system actions' })
  actorId!: string | null;

  @ApiProperty({ example: 'manager@store.com', nullable: true })
  actorEmail!: string | null;

  @ApiProperty({ enum: UserRole, nullable: true })
  actorRole!: UserRole | null;

  @ApiProperty({ example: 'product.update' })
  action!: string;

  @ApiProperty({ example: 'Product', nullable: true })
  entityType!: string | null;

  @ApiProperty({ example: '5f1c…', nullable: true })
  entityId!: string | null;

  @ApiProperty({ example: 'PATCH /api/products/5f1c…', nullable: true })
  summary!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Changed fields only. Secrets are stored as "[redacted]".',
    example: { price: { to: 499 } },
  })
  diff!: unknown;

  @ApiProperty({ example: '127.0.0.1', nullable: true })
  ip!: string | null;

  @ApiProperty({ example: 'Mozilla/5.0…', nullable: true })
  userAgent!: string | null;

  @ApiProperty({ example: '2026-07-28T10:00:00.000Z' })
  createdAt!: Date;

  static fromPrisma(row: AuditLog): AuditLogEntity {
    const entity = new AuditLogEntity();
    entity.id = row.id;
    entity.actorId = row.actorId;
    entity.actorEmail = row.actorEmail;
    entity.actorRole = row.actorRole;
    entity.action = row.action;
    entity.entityType = row.entityType;
    entity.entityId = row.entityId;
    entity.summary = row.summary;
    entity.diff = row.diff;
    entity.ip = row.ip;
    entity.userAgent = row.userAgent;
    entity.createdAt = row.createdAt;
    return entity;
  }
}
