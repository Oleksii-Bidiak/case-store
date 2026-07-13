import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { WishlistItemEntity } from './wishlist-item.entity';

/**
 * Domain entity representing a wishlist (saved products / favorites).
 *
 * This is a clean domain entity — not a Prisma model. It is returned by
 * WishlistService methods and contains only the data exposed to the client.
 * Mirrors `CartEntity`: a nullable `userId`, an HttpOnly-only `token`, the list
 * of items, and a lightweight `itemCount` for the header badge.
 */
export class WishlistEntity {
  @ApiProperty({
    description: 'Wishlist unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Owning user ID (null for guest wishlists)',
    example: '550e8400-e29b-41d4-a716-446655440001',
    nullable: true,
  })
  userId!: string | null;

  /**
   * Guest wishlist token. Never exposed in the JSON response — it travels
   * exclusively via the HttpOnly `wishlistToken` cookie.
   */
  @ApiHideProperty()
  token?: string | null;

  @ApiProperty({
    description: 'Saved products in the wishlist',
    type: [WishlistItemEntity],
  })
  items!: WishlistItemEntity[];

  @ApiProperty({
    description: 'Number of saved products (drives the header badge)',
    example: 3,
  })
  itemCount!: number;

  @ApiProperty({ description: 'Creation timestamp', example: '2024-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2024-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  /**
   * Create a WishlistEntity from a Prisma Wishlist model with its items.
   */
  static fromPrisma(wishlist: {
    id: string;
    userId: string | null;
    token?: string | null;
    createdAt: Date;
    updatedAt: Date;
    items: Array<{
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
    }>;
  }): WishlistEntity {
    const entity = new WishlistEntity();
    entity.id = wishlist.id;
    entity.userId = wishlist.userId;
    entity.items = wishlist.items.map((item) => WishlistItemEntity.fromPrisma(item));
    entity.itemCount = entity.items.length;
    entity.createdAt = wishlist.createdAt;
    entity.updatedAt = wishlist.updatedAt;
    return entity;
  }
}
