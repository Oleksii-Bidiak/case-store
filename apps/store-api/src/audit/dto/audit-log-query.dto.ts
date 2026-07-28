import { IsDate, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

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
}
