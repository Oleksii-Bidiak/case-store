import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { SeoSettings } from '@prisma/client';

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
  noindexSite?: boolean;
  llmsTxtSummary?: string | null;
  additionalSameAsLinks?: string[];
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
}
