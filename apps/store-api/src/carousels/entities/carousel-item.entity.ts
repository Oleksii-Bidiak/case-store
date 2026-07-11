import { ApiProperty } from '@nestjs/swagger';
import type { CarouselItemWithProduct } from '../carousels.repository';

/**
 * Minimal product summary embedded in a {@link CarouselItemEntity} so the
 * admin item panel never needs a follow-up request per row. Deliberately NOT
 * `isActive`-filtered upstream — a deactivated product still shows its real
 * name/image in the admin picker (flagged via `isActive`).
 */
export class CarouselItemProductEntity {
  @ApiProperty({
    description: 'Product unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ description: 'Product name', example: 'iPhone 15 Pro Case — Clear MagSafe' })
  name!: string;

  @ApiProperty({
    description: 'Primary product image URL (null when the product has no images)',
    example: '/images/products/case-1.jpg',
    type: String,
    nullable: true,
    required: false,
  })
  imageUrl!: string | null;

  @ApiProperty({
    description: 'Product price as string (avoids float precision)',
    example: '29.99',
  })
  price!: string;

  @ApiProperty({
    description:
      'Whether the product is currently active (an inactive product stays listed here for admin fidelity but is dropped from the public carousel)',
    example: true,
  })
  isActive!: boolean;
}

/**
 * One hand-picked product on a MANUAL carousel (admin read), joined with a
 * minimal product summary.
 */
export class CarouselItemEntity {
  @ApiProperty({
    description: 'Carousel item unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Product unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  productId!: string;

  @ApiProperty({ description: 'Display order within the carousel (lower = first)', example: 0 })
  sortOrder!: number;

  @ApiProperty({ description: 'Minimal product summary', type: CarouselItemProductEntity })
  product!: CarouselItemProductEntity;

  /**
   * Create a CarouselItemEntity from a repository row (item + joined product
   * summary), flattening the primary image to `product.imageUrl`.
   */
  static fromRepository(row: CarouselItemWithProduct): CarouselItemEntity {
    const entity = new CarouselItemEntity();
    entity.id = row.id;
    entity.productId = row.productId;
    entity.sortOrder = row.sortOrder;

    const product = new CarouselItemProductEntity();
    product.id = row.product.id;
    product.name = row.product.name;
    product.imageUrl = row.product.images[0]?.url ?? null;
    product.price = row.product.price.toString();
    product.isActive = row.product.isActive;
    entity.product = product;

    return entity;
  }
}
