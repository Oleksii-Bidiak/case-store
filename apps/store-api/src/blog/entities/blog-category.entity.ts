import { ApiProperty } from '@nestjs/swagger';

/**
 * Domain entity for a blog category (TASK-170).
 *
 * Clean domain entity (not a Prisma model) returned by BlogService. Categories
 * are always public — there is no visibility gate on them.
 */
export class BlogCategoryEntity {
  @ApiProperty({
    description: 'Category unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ description: 'URL-friendly slug', example: 'guides' })
  slug!: string;

  @ApiProperty({ description: 'Display name', example: 'Гайди' })
  name!: string;

  @ApiProperty({ description: 'Display sort order (lower = first)', example: 0 })
  sortOrder!: number;

  @ApiProperty({ description: 'Creation timestamp', example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  /**
   * Create a BlogCategoryEntity from a Prisma BlogCategory model.
   */
  static fromPrisma(category: {
    id: string;
    slug: string;
    name: string;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }): BlogCategoryEntity {
    const entity = new BlogCategoryEntity();
    entity.id = category.id;
    entity.slug = category.slug;
    entity.name = category.name;
    entity.sortOrder = category.sortOrder;
    entity.createdAt = category.createdAt;
    entity.updatedAt = category.updatedAt;
    return entity;
  }
}
