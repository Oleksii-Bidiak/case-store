import { ApiProperty } from '@nestjs/swagger';
import { BannerPlacement } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { ReorderFlatDto } from '../../common/dto';

/**
 * Body of `PATCH /api/admin/banners/reorder` (TASK-295).
 *
 * Extends the shared {@link ReorderFlatDto} with the bucket key banners are ordered
 * WITHIN — `placement` (the precedent is `ReorderCategoriesDto extends ReorderTreeDto`).
 * A banner's `sortOrder` is only ever meaningful inside its own placement, so the payload
 * must name the placement it describes: it is both the advisory-lock bucket and the WHERE
 * scope of every write, which is what makes it impossible for a payload to reorder — or
 * steal — a banner that lives in a different placement.
 *
 * Moving a banner BETWEEN placements is deliberately NOT part of this contract: it stays a
 * form edit (`PUT /:id` with a new `placement`). Drag-and-drop is within one list only.
 */
export class ReorderBannersDto extends ReorderFlatDto {
  @ApiProperty({
    description: 'The placement bucket whose complete ordering `orderedIds` describes',
    enum: BannerPlacement,
    example: BannerPlacement.HERO_SLIDE,
  })
  @IsEnum(BannerPlacement)
  placement!: BannerPlacement;
}
