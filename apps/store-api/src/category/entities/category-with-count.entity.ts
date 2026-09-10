import { ApiProperty } from '@nestjs/swagger';

/**
 * Domain entity representing a category with its product counts.
 *
 * Used for admin listing endpoints and the public category-by-slug read, where
 * the number of products per category is needed for display purposes. Contains
 * all CategoryEntity fields plus TWO counts (TASK-408):
 *
 * - `productCount` — active products filed DIRECTLY on this category;
 * - `subtreeProductCount` — this category plus every descendant, which is what a
 *   storefront category listing actually shows (it rolls up over the subtree,
 *   TASK-236).
 *
 * They differ for every parent category, and reporting only the first is what
 * made a parent read "0 товарів" beside a page listing nineteen of them.
 */
export class CategoryWithCountEntity {
  @ApiProperty({
    description: 'Category unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ description: 'Category name', example: 'Phone Cases' })
  name!: string;

  @ApiProperty({ description: 'URL-friendly slug', example: 'phone-cases' })
  slug!: string;

  @ApiProperty({
    description: 'Category description',
    example: 'Protective cases for all smartphones',
    type: String,
    nullable: true,
    required: false,
  })
  description!: string | null;

  @ApiProperty({
    description: 'Category image URL',
    example: 'https://example.com/images/phone-cases.jpg',
    type: String,
    nullable: true,
    required: false,
  })
  image!: string | null;

  @ApiProperty({
    description: 'Parent category ID (null for root)',
    example: '550e8400-e29b-41d4-a716-446655440000',
    type: String,
    nullable: true,
    required: false,
  })
  parentId!: string | null;

  @ApiProperty({ description: 'Whether the category is active', example: true })
  isActive!: boolean;

  @ApiProperty({ description: 'Display sort order (lower = first)', example: 0 })
  sortOrder!: number;

  @ApiProperty({ description: 'Creation timestamp', example: '2024-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2024-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  @ApiProperty({
    description: 'Number of ACTIVE products filed directly on this category',
    example: 42,
  })
  productCount!: number;

  @ApiProperty({
    description:
      'Number of ACTIVE products in this category and every descendant (TASK-408) — ' +
      'the figure the storefront category page lists',
    example: 61,
  })
  subtreeProductCount!: number;

  /**
   * Create a CategoryWithCountEntity from a Prisma Category model
   * with its aggregated product counts.
   */
  static fromPrisma(
    category: {
      id: string;
      name: string;
      slug: string;
      description: string | null;
      image: string | null;
      parentId: string | null;
      isActive: boolean;
      sortOrder: number;
      createdAt: Date;
      updatedAt: Date;
    },
    productCount: number,
    subtreeProductCount: number,
  ): CategoryWithCountEntity {
    const entity = new CategoryWithCountEntity();
    entity.id = category.id;
    entity.name = category.name;
    entity.slug = category.slug;
    entity.description = category.description;
    entity.image = category.image;
    entity.parentId = category.parentId;
    entity.isActive = category.isActive;
    entity.sortOrder = category.sortOrder;
    entity.createdAt = category.createdAt;
    entity.updatedAt = category.updatedAt;
    entity.productCount = productCount;
    entity.subtreeProductCount = subtreeProductCount;
    return entity;
  }
}
