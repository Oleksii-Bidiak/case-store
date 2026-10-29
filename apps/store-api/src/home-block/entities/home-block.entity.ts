import { ApiProperty } from '@nestjs/swagger';
import { CarouselSource, HomeBlockType, PublishStatus } from '@prisma/client';

/** The carousel a block points at, as much as the «Головна» screen needs to show it. */
export class HomeBlockCarouselSummaryEntity {
  @ApiProperty({ description: 'Carousel id', example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ description: 'Carousel title', example: 'Редакція обирає' })
  title!: string;

  @ApiProperty({ description: 'How the carousel picks its products', enum: CarouselSource })
  source!: CarouselSource;

  @ApiProperty({
    description: 'Carousel publish state — a block hides on the site while this is not PUBLISHED',
    enum: PublishStatus,
  })
  status!: PublishStatus;
}

/** One tab of a TABS block (admin read). */
export class HomeBlockTabEntity {
  @ApiProperty({ description: 'Tab position inside the block (0 = first)', example: 0 })
  sortOrder!: number;

  @ApiProperty({ description: 'The carousel this tab shows (its title is the tab label)' })
  carousel!: HomeBlockCarouselSummaryEntity;
}

/**
 * A homepage block as the «Головна» admin screen reads it (TASK-661): the row, what it
 * points at, and the flags the screen highlights.
 */
export class HomeBlockEntity {
  @ApiProperty({ description: 'Block id', example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({
    description: 'Which section this is',
    enum: HomeBlockType,
    enumName: 'HomeBlockType',
  })
  type!: HomeBlockType;

  @ApiProperty({
    description: 'Section heading — TABS only',
    type: String,
    nullable: true,
    example: 'Популярне',
  })
  title!: string | null;

  @ApiProperty({
    description:
      'Position on the page (lower = higher), kept dense 0..n-1 by create, delete and ' +
      'reorder — the same index `position` takes on create',
    example: 3,
  })
  sortOrder!: number;

  @ApiProperty({ description: 'Publish lifecycle state', enum: PublishStatus })
  status!: PublishStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, required: false })
  publishedAt!: Date | null;

  @ApiProperty({
    description: 'Future auto-publish instant while SCHEDULED',
    type: String,
    format: 'date-time',
    nullable: true,
    required: false,
  })
  scheduledAt!: Date | null;

  @ApiProperty({
    description: 'The carousel a CAROUSEL block shows (null for other types, and when deleted)',
    type: HomeBlockCarouselSummaryEntity,
    nullable: true,
  })
  carousel!: HomeBlockCarouselSummaryEntity | null;

  @ApiProperty({ description: 'Tabs of a TABS block, in order', type: [HomeBlockTabEntity] })
  tabs!: HomeBlockTabEntity[];

  @ApiProperty({
    description:
      'A singleton block (slider, trust strip, categories, promo banner, «Ви переглядали», ' +
      'newsletter) — can be hidden, scheduled and moved, never deleted',
  })
  isSystem!: boolean;

  @ApiProperty({
    description:
      'A CAROUSEL block whose carousel was DELETED (carousel = null) — it shows nothing ' +
      'until it is pointed at another carousel. Always false for other types. An orphaned ' +
      'block is also isEmpty.',
  })
  isOrphaned!: boolean;

  @ApiProperty({
    description:
      'The block would draw nothing of its own on the storefront right now, whatever its ' +
      'own status: a CAROUSEL block whose carousel is deleted, not PUBLISHED, or PUBLISHED ' +
      'but resolving to 0 products (e.g. «Розпродаж» with nothing on sale); a TABS block ' +
      'with no PUBLISHED tab that resolves to at least one product (the site then falls ' +
      'back to its automatic tabs). Products are resolved exactly as the homepage resolves ' +
      'them. Always false for singleton blocks (isSystem).',
  })
  isEmpty!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
