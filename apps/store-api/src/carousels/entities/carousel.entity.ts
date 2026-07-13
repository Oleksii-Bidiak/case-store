import { ApiProperty } from '@nestjs/swagger';
import { CarouselPlacement, CarouselSource, PublishStatus } from '@prisma/client';

/**
 * Domain entity representing an admin-managed recommendation carousel.
 *
 * Clean domain entity (not a Prisma model) returned by CarouselService admin
 * methods. The flat admin row — hand-picked MANUAL items are a separate read
 * ({@link CarouselItemEntity} via `GET /admin/carousels/:id/items`).
 */
export class CarouselEntity {
  @ApiProperty({
    description: 'Carousel unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ description: 'Carousel heading shown on the homepage', example: 'Хіти продажів' })
  title!: string;

  @ApiProperty({
    description: 'How the product list is computed',
    enum: CarouselSource,
    example: CarouselSource.BESTSELLING,
  })
  source!: CarouselSource;

  @ApiProperty({
    description: 'Category to pull products from (meaningful only when source = CATEGORY)',
    example: '550e8400-e29b-41d4-a716-446655440000',
    type: String,
    nullable: true,
    required: false,
  })
  categoryId!: string | null;

  @ApiProperty({
    description: 'Max products to show for a rule-based source (ignored for MANUAL)',
    example: 12,
  })
  itemLimit!: number;

  @ApiProperty({
    description:
      'Where the carousel surfaces on the homepage — HOME_TABS feeds one tab of the "Популярне" section, HOME_RAILS is a standalone rail',
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
    description: 'Publish lifecycle state — PUBLISHED is the public-visibility gate',
    enum: PublishStatus,
    example: PublishStatus.PUBLISHED,
  })
  status!: PublishStatus;

  @ApiProperty({
    description: 'When the carousel first went live (null while draft / scheduled)',
    example: '2026-07-01T00:00:00.000Z',
    type: String,
    format: 'date-time',
    nullable: true,
    required: false,
  })
  publishedAt!: Date | null;

  @ApiProperty({
    description: 'Future auto-publish instant while SCHEDULED (null otherwise)',
    example: '2026-08-01T09:00:00.000Z',
    type: String,
    format: 'date-time',
    nullable: true,
    required: false,
  })
  scheduledAt!: Date | null;

  @ApiProperty({ description: 'Creation timestamp', example: '2026-07-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2026-07-01T00:00:00.000Z' })
  updatedAt!: Date;

  /**
   * Create a CarouselEntity from a Prisma Carousel model.
   */
  static fromPrisma(carousel: {
    id: string;
    title: string;
    source: CarouselSource;
    categoryId: string | null;
    itemLimit: number;
    placement: CarouselPlacement;
    sortOrder: number;
    status: PublishStatus;
    publishedAt: Date | null;
    scheduledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): CarouselEntity {
    const entity = new CarouselEntity();
    entity.id = carousel.id;
    entity.title = carousel.title;
    entity.source = carousel.source;
    entity.categoryId = carousel.categoryId;
    entity.itemLimit = carousel.itemLimit;
    entity.placement = carousel.placement;
    entity.sortOrder = carousel.sortOrder;
    entity.status = carousel.status;
    entity.publishedAt = carousel.publishedAt;
    entity.scheduledAt = carousel.scheduledAt;
    entity.createdAt = carousel.createdAt;
    entity.updatedAt = carousel.updatedAt;
    return entity;
  }
}
