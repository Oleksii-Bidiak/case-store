import { ApiProperty } from '@nestjs/swagger';
import { CarouselPlacement } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { ReorderFlatDto } from '../../common/dto';

/**
 * Body of `PATCH /api/admin/carousels/reorder` (TASK-428).
 *
 * A carousel's `sortOrder` is only meaningful INSIDE its placement (the tab order
 * within HOME_TABS, the rail order within HOME_RAILS — see the `Carousel.sortOrder`
 * doc comment), so the payload must name the placement it describes. Structurally
 * identical to `ReorderBannersDto`, and for the same reasons: the placement is both
 * the advisory-lock bucket and the WHERE scope of every write, which is what makes
 * it impossible for a payload to reorder — or steal — a carousel from the other
 * placement.
 *
 * Moving a carousel BETWEEN placements stays a form edit (`PUT /:id` with a new
 * `placement`). Drag-and-drop is within one list only.
 */
export class ReorderCarouselsDto extends ReorderFlatDto {
  @ApiProperty({
    description: 'The placement bucket whose complete ordering `orderedIds` describes',
    enum: CarouselPlacement,
    example: CarouselPlacement.HOME_RAILS,
  })
  @IsEnum(CarouselPlacement)
  placement!: CarouselPlacement;
}
