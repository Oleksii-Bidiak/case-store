import {
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

/**
 * Sortable columns of the log viewer (TASK-356).
 *
 * `createdAt` stays the default — the log is append-only and read as a
 * timeline. The other two exist for the question the filters answer badly:
 * "what has this admin been doing" reads far better with every entry by one
 * actor adjacent, and `action` groups a noisy day into blocks.
 *
 * `entityType` is deliberately absent: the entity column renders a type/id pair,
 * and ordering by the type alone would look like it sorted the column when it
 * only sorted half of it. The entityType filter already answers that question.
 *
 * Exported so the repository allow-list comes from this same tuple — a sortBy
 * the DTO accepts and the repository ignores renders a sorted header over
 * unsorted rows, with nothing reporting a fault.
 */
export const AUDIT_LOG_SORT_FIELDS = ['createdAt', 'actorEmail', 'action'] as const;

/** Query for `GET /api/admin/audit-log` (TASK-318). */
export class AuditLogQueryDto {
  @ApiProperty({ description: 'Page number (1-based)', required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number = 1;

  @ApiProperty({ description: 'Items per page', required: false, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(200, { message: 'Limit must be at most 200' })
  limit?: number = 50;

  @ApiProperty({ description: 'Filter by actor user id', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  actorId?: string;

  /**
   * Filter by the actor's role AS RECORDED ON THE ENTRY (TASK-430).
   *
   * The column has been there since TASK-318 and nothing could filter on it, which
   * left the owner's question — "what did I change, and what did my staff change?"
   * — answerable only by pasting a uuid into `actorId`. With this, «Менеджери» is
   * one click, and it keeps being the right answer after that manager is
   * dismissed: the role is denormalised onto the row, so filtering by it does not
   * depend on the account still existing (or on it still holding the same role).
   *
   * CUSTOMER is accepted even though no such entry can exist today — the
   * interceptor only records routes behind an admin permission. Restricting the
   * enum to two of its three members would be a second, narrower copy of
   * `UserRole` that goes stale the day a customer-facing route becomes audited.
   */
  @ApiProperty({
    description: 'Filter by the actor role recorded on the entry',
    required: false,
    enum: UserRole,
  })
  @IsOptional()
  @IsEnum(UserRole, { message: `actorRole must be one of: ${Object.keys(UserRole).join(', ')}` })
  actorRole?: UserRole;

  @ApiProperty({ description: 'Filter by action, e.g. product.update', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  action?: string;

  @ApiProperty({ description: 'Filter by entity type, e.g. product', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  entityType?: string;

  @ApiProperty({ description: 'Filter by entity id', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityId?: string;

  @ApiProperty({ description: 'Only entries at or after this instant (ISO 8601)', required: false })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'from must be a valid ISO 8601 date' })
  from?: Date;

  @ApiProperty({
    description: 'Only entries at or before this instant (ISO 8601)',
    required: false,
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'to must be a valid ISO 8601 date' })
  to?: Date;

  @ApiProperty({
    description: `Sort field (${AUDIT_LOG_SORT_FIELDS.join(', ')})`,
    example: 'createdAt',
    required: false,
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  @IsIn(AUDIT_LOG_SORT_FIELDS, {
    message: `sortBy must be one of: ${AUDIT_LOG_SORT_FIELDS.join(', ')}`,
  })
  sortBy?: string = 'createdAt';

  @ApiProperty({
    description: 'Sort order (asc or desc)',
    example: 'desc',
    required: false,
    default: 'desc',
  })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'], { message: 'sortOrder must be asc or desc' })
  sortOrder?: 'asc' | 'desc' = 'desc';
}
