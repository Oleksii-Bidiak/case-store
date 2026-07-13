import { ApiProperty } from '@nestjs/swagger';
import { CarouselPlacement, CarouselSource } from '@prisma/client';
import { PublicProductEntity } from '../../product/entities';
import type { CarouselEntity } from './carousel.entity';

/**
 * Public (storefront) carousel: the published row plus its RESOLVED product
 * list. `products` reuses the existing {@link PublicProductEntity}, so the
 * storefront receives the exact same product-card shape PopularRail /
 * RecentlyViewed already consume. May legitimately be empty — the storefront
 * hides empty carousels client-side (§Empty-carousel behavior, plan 154).
 */
export class PublicCarouselEntity {
  @ApiProperty({
    description: 'Carousel unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ description: 'Carousel heading shown on the homepage', example: 'Хіти продажів' })
  title!: string;

  @ApiProperty({
    description: 'How the product list was computed',
    enum: CarouselSource,
    example: CarouselSource.BESTSELLING,
  })
  source!: CarouselSource;

  @ApiProperty({
    description:
      'Where the carousel surfaces on the homepage — HOME_TABS feeds one tab of the "Популярне" section (title = tab label), HOME_RAILS is a standalone rail',
    enum: CarouselPlacement,
    example: CarouselPlacement.HOME_RAILS,
  })
  placement!: CarouselPlacement;

  @ApiProperty({
    description: 'Display order WITHIN the placement (lower = first)',
    example: 0,
  })
  sortOrder!: number;

  @ApiProperty({
    description: 'Resolved, ordered product list (may be empty)',
    type: [PublicProductEntity],
  })
  products!: PublicProductEntity[];

  /**
   * Assemble a PublicCarouselEntity from an admin entity + its resolved products.
   */
  static fromEntity(
    carousel: Pick<CarouselEntity, 'id' | 'title' | 'source' | 'placement' | 'sortOrder'>,
    products: PublicProductEntity[],
  ): PublicCarouselEntity {
    const entity = new PublicCarouselEntity();
    entity.id = carousel.id;
    entity.title = carousel.title;
    entity.source = carousel.source;
    entity.placement = carousel.placement;
    entity.sortOrder = carousel.sortOrder;
    entity.products = products;
    return entity;
  }
}
