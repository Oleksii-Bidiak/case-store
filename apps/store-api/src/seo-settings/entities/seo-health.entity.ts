import { ApiProperty } from '@nestjs/swagger';
import { ContentSeoCounts } from '../seo-settings.repository';

/**
 * SEO-health checklist entity (TASK-269) — six catalog COUNTs powering the
 * «SEO-здоров'я» section on /settings/seo. For each of products / categories /
 * pages: how many LIVE rows lack their own `metaTitle` (relying on auto-generated
 * titles — informational, not an error) and how many are live in total.
 *
 * A clean domain entity, not a Prisma model. The "defaults filled" and
 * "noindex" checks are deliberately NOT here — they are derived client-side from
 * the SeoSettings entity the settings page already fetches (plan 131 Decision 1).
 */
export class SeoHealthEntity {
  @ApiProperty({
    type: Number,
    description: 'Live products (isActive, not soft-deleted) with no own metaTitle',
    example: 12,
  })
  productsMissingMetaTitle!: number;

  @ApiProperty({
    type: Number,
    description: 'Total live products (isActive, not soft-deleted)',
    example: 40,
  })
  productsTotal!: number;

  @ApiProperty({
    type: Number,
    description: 'Live categories (isActive) with no own metaTitle',
    example: 3,
  })
  categoriesMissingMetaTitle!: number;

  @ApiProperty({ type: Number, description: 'Total live categories (isActive)', example: 8 })
  categoriesTotal!: number;

  @ApiProperty({
    type: Number,
    description: 'Published pages with no own metaTitle',
    example: 1,
  })
  pagesMissingMetaTitle!: number;

  @ApiProperty({ type: Number, description: 'Total published pages', example: 5 })
  pagesTotal!: number;

  /** Build the entity from the repository's raw counts. */
  static fromCounts(counts: ContentSeoCounts): SeoHealthEntity {
    const entity = new SeoHealthEntity();
    entity.productsMissingMetaTitle = counts.productsMissingMetaTitle;
    entity.productsTotal = counts.productsTotal;
    entity.categoriesMissingMetaTitle = counts.categoriesMissingMetaTitle;
    entity.categoriesTotal = counts.categoriesTotal;
    entity.pagesMissingMetaTitle = counts.pagesMissingMetaTitle;
    entity.pagesTotal = counts.pagesTotal;
    return entity;
  }
}
