import { ApiProperty } from '@nestjs/swagger';
import { HomeBlockType, PublishStatus } from '@prisma/client';
import { PublicCarouselEntity } from '../../carousels';

/**
 * One section of the storefront homepage (TASK-661), as `GET /api/home-blocks` returns
 * it: the block plus everything it needs to render, resolved in the same response so
 * the storefront makes ONE request for the whole page.
 *
 *   - CAROUSEL → `carousel` with its products; `tabs` empty.
 *   - TABS     → `title` + `tabs` (carousels with products, in tab order). May be EMPTY:
 *                the storefront then shows its query-driven fallback tabs.
 *   - any other type → neither; the component renders its own content (banners,
 *     categories, the newsletter form…).
 */
export class PublicHomeBlockEntity {
  @ApiProperty({ description: 'Block id', example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({
    description: 'Which section this is',
    enum: HomeBlockType,
    enumName: 'HomeBlockType',
  })
  type!: HomeBlockType;

  @ApiProperty({
    description: 'Section heading — TABS only, null for every other type',
    example: 'Популярне',
    type: String,
    nullable: true,
  })
  title!: string | null;

  @ApiProperty({ description: 'Position on the page (lower = higher)', example: 3 })
  sortOrder!: number;

  @ApiProperty({
    description:
      'Publish state. Always PUBLISHED on a public read; a signed homepage preview also ' +
      'returns DRAFT and SCHEDULED blocks so the owner sees the page before it goes live.',
    enum: PublishStatus,
  })
  status!: PublishStatus;

  @ApiProperty({
    description: 'The carousel a CAROUSEL block shows, with its products (null otherwise)',
    type: PublicCarouselEntity,
    nullable: true,
  })
  carousel!: PublicCarouselEntity | null;

  @ApiProperty({
    description: 'The tabs of a TABS block, in order, each with its products (empty otherwise)',
    type: [PublicCarouselEntity],
  })
  tabs!: PublicCarouselEntity[];
}
