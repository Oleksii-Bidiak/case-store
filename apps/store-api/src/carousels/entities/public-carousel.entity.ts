import { ApiProperty } from '@nestjs/swagger';
import { CarouselSource, PublishStatus } from '@prisma/client';
import { PublicProductEntity } from '../../product';
import type { CarouselEntity } from './carousel.entity';

/**
 * Public (storefront) carousel: the row plus its RESOLVED product list.
 * `products` reuses the existing {@link PublicProductEntity}, so the storefront
 * receives the exact same product-card shape PopularRail / RecentlyViewed already
 * consume. May legitimately be empty — the storefront hides empty carousels
 * client-side (§Empty-carousel behavior, plan 154).
 *
 * WHERE it renders is not a property of the carousel since TASK-660: the homepage
 * block holding it decides (a standalone rail, or one tab of a TABS block).
 */
export class PublicCarouselEntity {
  @ApiProperty({
    description: 'Carousel unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Carousel heading — the rail title, or the tab label inside a TABS block',
    example: 'Хіти продажів',
  })
  title!: string;

  @ApiProperty({
    description: 'How the product list was computed',
    enum: CarouselSource,
    example: CarouselSource.BESTSELLING,
  })
  source!: CarouselSource;

  @ApiProperty({
    description:
      'Publish state. Always PUBLISHED on a public read; a signed homepage preview also ' +
      'returns DRAFT / SCHEDULED carousels so the owner sees the page before publishing.',
    enum: PublishStatus,
    example: PublishStatus.PUBLISHED,
  })
  status!: PublishStatus;

  @ApiProperty({
    description: 'Position in the admin carousel list (not the homepage order)',
    example: 0,
  })
  sortOrder!: number;

  @ApiProperty({
    description: 'Resolved, ordered product list (may be empty)',
    type: [PublicProductEntity],
  })
  products!: PublicProductEntity[];

  /**
   * Assemble a PublicCarouselEntity from a carousel row + its resolved products.
   */
  static fromEntity(
    carousel: Pick<CarouselEntity, 'id' | 'title' | 'source' | 'status' | 'sortOrder'>,
    products: PublicProductEntity[],
  ): PublicCarouselEntity {
    const entity = new PublicCarouselEntity();
    entity.id = carousel.id;
    entity.title = carousel.title;
    entity.source = carousel.source;
    entity.status = carousel.status;
    entity.sortOrder = carousel.sortOrder;
    entity.products = products;
    return entity;
  }
}
