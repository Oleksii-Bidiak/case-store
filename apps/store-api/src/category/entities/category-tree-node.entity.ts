import { ApiProperty } from '@nestjs/swagger';

/**
 * Domain entity representing a category node in a tree structure.
 *
 * Used for the public category tree endpoint (GET /api/categories/tree)
 * where categories are nested with their children for navigation menus.
 *
 * Unlike CategoryEntity, this includes a `children` array for
 * recursive nesting but excludes parentId and createdAt since
 * the hierarchy is expressed through nesting. `updatedAt` is
 * carried for SEO consumers (sitemap `lastModified`, TASK-277),
 * mirroring how TASK-247 surfaced metaTitle/metaDescription.
 */
export class CategoryTreeNodeEntity {
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

  @ApiProperty({ description: 'Whether the category is active', example: true })
  isActive!: boolean;

  @ApiProperty({ description: 'Display sort order (lower = first)', example: 0 })
  sortOrder!: number;

  @ApiProperty({
    description: 'SEO meta title override (falls back to name when empty)',
    example: 'Phone Cases — Premium Protection | Store',
    type: String,
    nullable: true,
    required: false,
  })
  metaTitle!: string | null;

  @ApiProperty({
    description: 'SEO meta description override',
    example: 'Shop premium protective phone cases for every model.',
    type: String,
    nullable: true,
    required: false,
  })
  metaDescription!: string | null;

  @ApiProperty({ description: 'Last update timestamp', example: '2024-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  @ApiProperty({ description: 'Child categories', type: [CategoryTreeNodeEntity] })
  children!: CategoryTreeNodeEntity[];

  /**
   * Create a CategoryTreeNodeEntity from a Prisma Category model
   * with recursively included children.
   *
   * Expects Prisma result with nested `children` relations
   * (e.g., using `include: { children: { include: { children: ... } } }`).
   */
  static fromPrisma(category: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    image: string | null;
    isActive: boolean;
    sortOrder: number;
    metaTitle?: string | null;
    metaDescription?: string | null;
    updatedAt: Date;
    children: Array<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
      image: string | null;
      isActive: boolean;
      sortOrder: number;
      metaTitle?: string | null;
      metaDescription?: string | null;
      updatedAt: Date;
      children: unknown[];
    }>;
  }): CategoryTreeNodeEntity {
    const entity = new CategoryTreeNodeEntity();
    entity.id = category.id;
    entity.name = category.name;
    entity.slug = category.slug;
    entity.description = category.description;
    entity.image = category.image;
    entity.isActive = category.isActive;
    entity.sortOrder = category.sortOrder;
    entity.metaTitle = category.metaTitle ?? null;
    entity.metaDescription = category.metaDescription ?? null;
    entity.updatedAt = category.updatedAt;
    entity.children = (category.children ?? []).map((child) =>
      CategoryTreeNodeEntity.fromPrisma(
        child as Parameters<typeof CategoryTreeNodeEntity.fromPrisma>[0],
      ),
    );
    return entity;
  }
}
