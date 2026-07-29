import { IsOptional, IsEnum, IsInt, IsString, MaxLength, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { BannerPlacement, PublishStatus } from '@prisma/client';

/**
 * Query DTO for the public banner list (published banners only), with an
 * optional placement filter.
 */
export class BannerListQueryDto {
  @ApiProperty({
    description: 'Filter by placement slot',
    enum: BannerPlacement,
    example: BannerPlacement.HERO_SLIDE,
    required: false,
  })
  @IsOptional()
  @IsEnum(BannerPlacement, {
    message: `placement must be one of: ${Object.values(BannerPlacement).join(', ')}`,
  })
  placement?: BannerPlacement;
}

/**
 * Query DTO for the admin banner list (all statuses), with optional placement
 * and status filters, plus opt-in pagination and a title search (TASK-357).
 *
 * PAGINATION LIVES ONLY ON THE ADMIN SUBCLASS, never on the public
 * {@link BannerListQueryDto}. `GET /api/banners` is read server-side by the
 * storefront homepage (`store-client/src/shared/api/banners-server.ts`), which
 * groups the WHOLE published set by placement; a default page size there would
 * silently drop placements. The public DTO therefore still rejects `page` /
 * `limit` outright (`forbidNonWhitelisted`), which is the strongest proof the
 * storefront path is untouched.
 *
 * `page` and `limit` carry NO field initializer on purpose: their ABSENCE is the
 * signal for "return everything", which is what the admin banner view needs —
 * its drag-and-drop reorder payload must name every banner of a placement or the
 * server rejects it as a lost update (409, see `common/reorder`).
 */
export class AdminBannerListQueryDto extends BannerListQueryDto {
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

  @ApiProperty({ description: 'Search by banner title', example: 'знижк', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Search query must be at most 200 characters' })
  search?: string;
}
