import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { PublishStatus, SeoSettings } from '@prisma/client';

/**
 * Well-known fixed ID for the singleton SEO-settings row.
 *
 * There is EXACTLY ONE row in `seo_settings`, always identified by this
 * constant. The seed creates/upserts it; the repository reads and upserts it.
 * Distinct from `SiteContactRepository.SINGLETON_ID` (`...0001`) so the two
 * singletons never collide in logs / seed output (plan 116 Decision 1).
 */
export const SINGLETON_ID = '00000000-0000-0000-0000-000000000002';

/**
 * Fields that may be written to the singleton SEO-settings row.
 * All are optional — only provided fields are updated.
 */
export interface UpsertSeoSettingsInput {
  defaultMetaTitle?: string | null;
  defaultMetaDescription?: string | null;
  titleTemplate?: string | null;
  defaultOgImage?: string | null;
  googleSiteVerification?: string | null;
  bingSiteVerification?: string | null;
  noindexSite?: boolean;
  llmsTxtSummary?: string | null;
  additionalSameAsLinks?: string[];
}

/**
 * Six catalog COUNTs for the SEO-health checklist (TASK-269): for each of
 * products / categories / pages, how many LIVE rows lack their own `metaTitle`
 * (the numerator — relying on auto-generated titles, which is fine, not an
 * error) and how many are live at all (the denominator).
 */
export interface ContentSeoCounts {
  productsMissingMetaTitle: number;
  productsTotal: number;
  categoriesMissingMetaTitle: number;
  categoriesTotal: number;
  pagesMissingMetaTitle: number;
  pagesTotal: number;
}

@Injectable()
export class SeoSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read the singleton SEO-settings row.
   * Returns the row or null if it has not been seeded yet.
   */
  findSettings(): Promise<SeoSettings | null> {
    return this.prisma.seoSettings.findUnique({
      where: { id: SINGLETON_ID },
    });
  }

  /**
   * Upsert the singleton SEO-settings row.
   * Creates the row (with the well-known ID) on first write, updates it
   * thereafter. Only the provided fields are written.
   */
  upsertSettings(data: UpsertSeoSettingsInput): Promise<SeoSettings> {
    return this.prisma.seoSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: { ...data },
    });
  }

  /**
   * Six cheap COUNTs for the SEO-health checklist (TASK-269), run in one
   * `Promise.all` — no joins, no N+1 — mirroring `DashboardRepository.getNeedsAction()`.
   *
   * "Live" scoping follows each entity's canonical visibility gate (plan 131
   * Design Decision 2), so draft/inactive/soft-deleted rows are excluded from
   * BOTH the missing-metaTitle numerator and the total denominator:
   *   - Products:   `isActive: true, deletedAt: null` (visibility toggle + tombstone)
   *   - Categories: `isActive: true` (no soft-delete column on Category)
   *   - Pages:      `status: PUBLISHED` (the Етап-2 publishing gate — NOT the
   *                 derived `isActive` mirror, per plan 104)
   */
  async getContentSeoCounts(): Promise<ContentSeoCounts> {
    const [
      productsMissingMetaTitle,
      productsTotal,
      categoriesMissingMetaTitle,
      categoriesTotal,
      pagesMissingMetaTitle,
      pagesTotal,
    ] = await Promise.all([
      this.prisma.product.count({
        where: { metaTitle: null, isActive: true, deletedAt: null },
      }),
      this.prisma.product.count({ where: { isActive: true, deletedAt: null } }),
      this.prisma.category.count({ where: { metaTitle: null, isActive: true } }),
      this.prisma.category.count({ where: { isActive: true } }),
      this.prisma.page.count({
        where: { metaTitle: null, status: PublishStatus.PUBLISHED },
      }),
      this.prisma.page.count({ where: { status: PublishStatus.PUBLISHED } }),
    ]);

    return {
      productsMissingMetaTitle,
      productsTotal,
      categoriesMissingMetaTitle,
      categoriesTotal,
      pagesMissingMetaTitle,
      pagesTotal,
    };
  }
}
