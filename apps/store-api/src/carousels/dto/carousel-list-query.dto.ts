import { IsOptional, IsEnum } from 'class-validator';
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
 * and status filters.
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
}
