import { IsOptional, IsEnum } from 'class-validator';
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
 * and status filters.
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
}
