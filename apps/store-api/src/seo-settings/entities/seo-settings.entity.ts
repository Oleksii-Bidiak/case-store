import { ApiProperty } from '@nestjs/swagger';
import { SeoSettings } from '@prisma/client';
import { SINGLETON_ID } from '../seo-settings.repository';

/**
 * Domain entity representing the singleton SEO settings.
 *
 * A clean domain entity — not a Prisma model. Returned by SeoSettingsService and
 * consumed by the storefront (root metadata, robots.ts, llms.txt, Organization
 * `sameAs`). The nullable fields may be unseeded, or an admin may clear any one
 * of them; `noindexSite` and `additionalSameAsLinks` always have a value.
 */
export class SeoSettingsEntity {
  @ApiProperty({
    description: 'Singleton row identifier (always the well-known constant)',
    example: SINGLETON_ID,
  })
  id!: string;

  @ApiProperty({
    description: 'Default meta title used when a page has no own title',
    example: 'MobileStore — аксесуари для смартфонів',
    type: String,
    nullable: true,
    required: false,
  })
  defaultMetaTitle!: string | null;

  @ApiProperty({
    description: 'Default meta description used when a page has no own description',
    example: 'Мультибрендовий магазин аксесуарів та Apple-техніки. Доставка по Україні.',
    type: String,
    nullable: true,
    required: false,
  })
  defaultMetaDescription!: string | null;

  @ApiProperty({
    description: 'Title template — must contain exactly one `%s` token, e.g. "%s | MobileStore"',
    example: '%s | MobileStore',
    type: String,
    nullable: true,
    required: false,
  })
  titleTemplate!: string | null;

  @ApiProperty({
    description: 'Default Open Graph / social-preview image URL',
    example: 'https://mobilestore.ua/og-default.jpg',
    type: String,
    nullable: true,
    required: false,
  })
  defaultOgImage!: string | null;

  @ApiProperty({
    description:
      'Google Search Console ownership-verification token (HTML-tag method); null when not configured',
    example: 'AbCdEfGhIjKlMnOpQrStUvWxYz1234567890',
    type: String,
    nullable: true,
    required: false,
  })
  googleSiteVerification!: string | null;

  @ApiProperty({
    description:
      'Bing Webmaster Tools ownership-verification token (HTML-tag method, `msvalidate.01`); null when not configured',
    example: '1234ABCD5678EFGH9012IJKL3456MNOP',
    type: String,
    nullable: true,
    required: false,
  })
  bingSiteVerification!: string | null;

  @ApiProperty({
    description: 'Site-wide noindex kill switch (hides the whole site from search engines)',
    example: false,
  })
  noindexSite!: boolean;

  @ApiProperty({
    description: 'Overrides only the intro paragraph of /llms.txt (AI-assistant map)',
    example: 'Магазин аксесуарів для смартфонів та Apple-техніки в Україні.',
    type: String,
    nullable: true,
    required: false,
  })
  llmsTxtSummary!: string | null;

  @ApiProperty({
    description:
      'Additional brand-authority profile URLs merged into the Organization `sameAs` schema',
    example: ['https://facebook.com/mobilestore', 'https://youtube.com/@mobilestore'],
    type: [String],
  })
  additionalSameAsLinks!: string[];

  @ApiProperty({ description: 'Creation timestamp', example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  /**
   * Build an entity from the Prisma row.
   */
  static fromPrisma(row: SeoSettings): SeoSettingsEntity {
    const entity = new SeoSettingsEntity();
    entity.id = row.id;
    entity.defaultMetaTitle = row.defaultMetaTitle;
    entity.defaultMetaDescription = row.defaultMetaDescription;
    entity.titleTemplate = row.titleTemplate;
    entity.defaultOgImage = row.defaultOgImage;
    entity.googleSiteVerification = row.googleSiteVerification;
    entity.bingSiteVerification = row.bingSiteVerification;
    entity.noindexSite = row.noindexSite;
    entity.llmsTxtSummary = row.llmsTxtSummary;
    entity.additionalSameAsLinks = row.additionalSameAsLinks;
    entity.createdAt = row.createdAt;
    entity.updatedAt = row.updatedAt;
    return entity;
  }

  /**
   * Build an empty entity (zero-config defaults) for the case where the
   * singleton row has not been seeded yet. The public GET endpoint never 404s.
   */
  static empty(): SeoSettingsEntity {
    const entity = new SeoSettingsEntity();
    const now = new Date(0);
    entity.id = SINGLETON_ID;
    entity.defaultMetaTitle = null;
    entity.defaultMetaDescription = null;
    entity.titleTemplate = null;
    entity.defaultOgImage = null;
    entity.googleSiteVerification = null;
    entity.bingSiteVerification = null;
    entity.noindexSite = false;
    entity.llmsTxtSummary = null;
    entity.additionalSameAsLinks = [];
    entity.createdAt = now;
    entity.updatedAt = now;
    return entity;
  }
}
