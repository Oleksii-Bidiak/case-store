import { IsOptional, IsInt, IsEnum, IsString, MaxLength, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PublishStatus } from '@prisma/client';

/**
 * Query DTO for the public page list (published pages only).
 */
export class PageListQueryDto {
  @ApiProperty({ description: 'Page number (1-based)', example: 1, required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    example: 20,
    required: false,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit must be at most 100' })
  limit?: number = 20;
}

/**
 * Query DTO for the admin page list (all statuses), with an optional status
 * filter and a title/slug search (TASK-357).
 *
 * The search lives ONLY on the admin list: the public `GET /api/pages` backs the
 * `/legal` hub, which lists everything published and has nothing to search.
 *
 * It deliberately does NOT extend {@link PageListQueryDto} any more (TASK-428).
 * That superclass carries FIELD INITIALIZERS (`page = 1`, `limit = 20`), so the
 * admin list could never be asked for the complete set — and the reorder UI needs
 * exactly that: a payload that does not name every page in the list is rejected as
 * a lost update. Here `page`/`limit` carry no initializer, so their ABSENCE means
 * "return everything", matching `AdminFaqListQueryDto` and the admin banner list.
 */
export class AdminPageListQueryDto {
  @ApiProperty({
    description: 'Page number (1-based). Omit both page and limit to get the complete list.',
    example: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number;

  @ApiProperty({
    description: 'Items per page. Omit both page and limit to get the complete list.',
    example: 20,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit must be at most 100' })
  limit?: number;

  @ApiProperty({
    description: 'Filter by publish status (DRAFT, SCHEDULED, PUBLISHED)',
    enum: PublishStatus,
    example: PublishStatus.PUBLISHED,
    required: false,
  })
  @IsOptional()
  @IsEnum(PublishStatus, {
    message: `status must be one of: ${Object.values(PublishStatus).join(', ')}`,
  })
  status?: PublishStatus;

  @ApiProperty({
    description: 'Search by page title or slug',
    example: 'достав',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Search query must be at most 200 characters' })
  search?: string;
}
