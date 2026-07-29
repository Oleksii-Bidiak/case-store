import { IsOptional, IsEnum, IsInt, IsString, MaxLength, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CarouselPlacement, PublishStatus } from '@prisma/client';

/**
 * Query DTO for the public carousel list (published carousels only), with an
 * optional placement filter. Omitting `placement` keeps the pre-TASK-288
 * behaviour: every published carousel, whatever its placement.
 */
export class CarouselListQueryDto {
  @ApiProperty({
    description: 'Filter by homepage placement (HOME_TABS = "Популярне" tabs, HOME_RAILS = rails)',
    enum: CarouselPlacement,
    example: CarouselPlacement.HOME_TABS,
    required: false,
  })
  @IsOptional()
  @IsEnum(CarouselPlacement, {
    message: `placement must be one of: ${Object.values(CarouselPlacement).join(', ')}`,
  })
  placement?: CarouselPlacement;
}

/**
 * Query DTO for the admin carousel list (all statuses), with optional placement
 * and status filters, plus opt-in pagination and a title search (TASK-357).
 *
 * PAGINATION LIVES ONLY ON THE ADMIN SUBCLASS, never on the public
 * {@link CarouselListQueryDto}. `GET /api/carousels` is read server-side by the
 * homepage (`store-client/src/shared/api/carousels-server.ts`), which groups the
 * whole published set by placement; a default page size there would silently
 * amputate the homepage. The public DTO still rejects `page` / `limit` outright
 * (`forbidNonWhitelisted`), which is the strongest proof that path is untouched.
 *
 * `page` and `limit` carry NO field initializer on purpose — their ABSENCE means
 * "return everything", preserving today's behaviour for any caller that omits them.
 */
export class AdminCarouselListQueryDto extends CarouselListQueryDto {
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

  @ApiProperty({ description: 'Search by carousel title', example: 'новин', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Search query must be at most 200 characters' })
  search?: string;
}
