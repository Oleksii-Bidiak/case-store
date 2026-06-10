import { ApiProperty } from '@nestjs/swagger';

/**
 * Domain entity representing a category.
 *
 * This is a clean domain entity — not a Prisma model.
 * It is returned by CategoryService methods and contains only
 * the data that should be exposed to the client.
 *
 * Relation fields (parent, children, products) are EXCLUDED
 * from the base entity. Use CategoryTreeNodeEntity for tree
 * responses and CategoryWithCountEntity for admin listings.
 */
export class CategoryEntity {
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

  /**
   * Create a CategoryEntity from a Prisma Category model.
   * Strips out relation fields (parent, children, products).
   */
  static fromPrisma(category: {
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
  }): CategoryEntity {
    const entity = new CategoryEntity();
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
    return entity;
  }
}
