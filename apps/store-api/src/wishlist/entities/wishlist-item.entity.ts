import { ApiProperty } from '@nestjs/swagger';
import { MAX_QUANTITY } from '../../common/constants';

/**
 * Domain entity representing a single saved product in a wishlist.
 *
 * This is a clean domain entity — not a Prisma model. It carries enough product
 * summary data (slug, image, price, active flag) for the `/wishlist` grid to
 * render a `ProductCard` and link to the PDP without an extra request per
 * item, plus `maxQty` — the orderable cap derived from the product's stock
 * (`min(MAX_QUANTITY, stock)`; the raw stock figure is never exposed, the
 * wishlist twin of TASK-205 — TASK-231). Unlike a cart line there is no
 * quantity — a wishlist is a set.
 *
 * Decimal fields (price, compareAtPrice) are converted to strings to avoid
 * floating-point precision issues in JSON serialization.
 */
export class WishlistItemEntity {
  @ApiProperty({
    description: 'Wishlist item unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Product (position) ID this item refers to',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  productId!: string;

  @ApiProperty({
    description: 'Product name',
    example: 'iPhone 15 Pro Case — Clear MagSafe',
  })
  productName!: string;

  @ApiProperty({
    description: 'URL slug for the PDP link',
    example: 'iphone-15-pro-case-clear-magsafe',
  })
  productSlug!: string;

  @ApiProperty({
    description: 'Primary image URL, null when the product has no images',
    type: String,
    nullable: true,
    required: false,
  })
  imageUrl!: string | null;

  @ApiProperty({
    description: 'Unit price as string',
    example: '29.99',
  })
  price!: string;

  @ApiProperty({
    description: 'Original price for discount display (from product)',
    type: String,
    example: '39.99',
    required: false,
    nullable: true,
  })
  compareAtPrice!: string | null;

  @ApiProperty({
    description:
      'Maximum orderable quantity for this position — available stock capped at the per-item limit; 0 means out of stock. The raw stock figure is intentionally not exposed (TASK-231, mirrors the cart contract from TASK-205).',
    example: 50,
  })
  maxQty!: number;

  @ApiProperty({
    description:
      'Whether this saved product is still buyable — the product position is active AND its category is (TASK-297). `false` means it has been withdrawn from sale and the storefront must mark it unavailable; it is the SAME flag a deactivated product has always raised, mirroring the cart line contract.',
    example: true,
  })
  isActive!: boolean;

  @ApiProperty({ description: 'Creation timestamp', example: '2024-01-01T00:00:00.000Z' })
  createdAt!: Date;

  /**
   * Create a WishlistItemEntity from a Prisma WishlistItem row with its product
   * relation. Converts Decimal fields to strings and flattens the primary image.
   */
  static fromPrisma(item: {
    id: string;
    productId: string;
    createdAt: Date;
    product: {
      id: string;
      name: string;
      slug: string;
      price: { toString(): string };
      compareAtPrice: { toString(): string } | null;
      stock: number;
      isActive: boolean;
      category: { isActive: boolean };
      images: Array<{ url: string }>;
    };
  }): WishlistItemEntity {
    const entity = new WishlistItemEntity();
    entity.id = item.id;
    entity.productId = item.productId;
    entity.productName = item.product.name;
    entity.productSlug = item.product.slug;
    entity.imageUrl = item.product.images[0]?.url ?? null;
    entity.price = item.product.price.toString();
    entity.compareAtPrice = item.product.compareAtPrice
      ? item.product.compareAtPrice.toString()
      : null;
    // Public cap, never the raw stock: the client only needs min(cap, stock).
    entity.maxQty = Math.min(MAX_QUANTITY, item.product.stock);
    // Withdrawing the CATEGORY withdraws the saved product (TASK-297) — folded
    // into the existing flag exactly as the cart line does, so no second
    // "unavailable" mechanism exists and every reader handles it for free.
    entity.isActive = item.product.isActive && item.product.category.isActive;
    entity.createdAt = item.createdAt;
    return entity;
  }
}
