import { ApiProperty } from '@nestjs/swagger';
import { BannerPlacement, PublishStatus } from '@prisma/client';

/**
 * Domain entity representing a homepage banner.
 *
 * Clean domain entity (not a Prisma model) returned by BannerService methods.
 * Banners carry STRUCTURED content (title / subtitle / CTA) — plain strings, not
 * Tiptap HTML — so no rich-text sanitization is involved.
 */
export class BannerEntity {
  @ApiProperty({
    description: 'Banner unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Homepage placement slot this banner renders in',
    enum: BannerPlacement,
    example: BannerPlacement.HERO_SLIDE,
  })
  placement!: BannerPlacement;

  @ApiProperty({ description: 'Banner headline', example: 'Літній розпродаж' })
  title!: string;

  @ApiProperty({
    description: 'Supporting text under the headline',
    example: 'Знижки до -50% на аксесуари',
    type: String,
    nullable: true,
    required: false,
  })
  subtitle!: string | null;

  @ApiProperty({
    description: 'Banner image URL (absolute or storefront-relative)',
    example: '/images/banners/summer.jpg',
    type: String,
    nullable: true,
    required: false,
  })
  imageUrl!: string | null;

  @ApiProperty({
    description: 'Base64 blur placeholder for next/image',
    type: String,
    nullable: true,
    required: false,
  })
  imageBlurDataUrl!: string | null;

  @ApiProperty({
    description: 'Call-to-action label',
    example: 'Купити зараз',
    type: String,
    nullable: true,
    required: false,
  })
  ctaLabel!: string | null;

  @ApiProperty({
    description: 'Call-to-action link (href)',
    example: '/catalog?sale=true',
    type: String,
    nullable: true,
    required: false,
  })
  ctaHref!: string | null;

  @ApiProperty({
    description: 'Optional accent / variant key interpreted by the storefront UI',
    example: 'accent',
    type: String,
    nullable: true,
    required: false,
  })
  theme!: string | null;

  @ApiProperty({ description: 'Display sort order within a placement (lower = first)', example: 0 })
  sortOrder!: number;

  @ApiProperty({
    description: 'Publish lifecycle state — PUBLISHED is the public-visibility gate',
    enum: PublishStatus,
    example: PublishStatus.PUBLISHED,
  })
  status!: PublishStatus;

  @ApiProperty({
    description: 'When the banner first went live (null while draft / scheduled)',
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
   * Create a BannerEntity from a Prisma Banner model.
   */
  static fromPrisma(banner: {
    id: string;
    placement: BannerPlacement;
    title: string;
    subtitle: string | null;
    imageUrl: string | null;
    imageBlurDataUrl: string | null;
    ctaLabel: string | null;
    ctaHref: string | null;
    theme: string | null;
    sortOrder: number;
    status: PublishStatus;
    publishedAt: Date | null;
    scheduledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): BannerEntity {
    const entity = new BannerEntity();
    entity.id = banner.id;
    entity.placement = banner.placement;
    entity.title = banner.title;
    entity.subtitle = banner.subtitle;
    entity.imageUrl = banner.imageUrl;
    entity.imageBlurDataUrl = banner.imageBlurDataUrl;
    entity.ctaLabel = banner.ctaLabel;
    entity.ctaHref = banner.ctaHref;
    entity.theme = banner.theme;
    entity.sortOrder = banner.sortOrder;
    entity.status = banner.status;
    entity.publishedAt = banner.publishedAt;
    entity.scheduledAt = banner.scheduledAt;
    entity.createdAt = banner.createdAt;
    entity.updatedAt = banner.updatedAt;
    return entity;
  }
}
