import { Injectable } from '@nestjs/common';
import { SeoSettingsRepository, UpsertSeoSettingsInput } from './seo-settings.repository';
import { SeoSettingsEntity, SeoHealthEntity } from './entities';
import { RevalidationNotifier } from '../publishing';

/**
 * Cache tag purged on the storefront after every SEO-settings write. The
 * storefront's `seo-settings-server.ts` fetch is tagged with the same value, so
 * `revalidateTag('seo-settings')` refreshes every ISR page that reads it (root
 * metadata, robots.ts, llms.txt, the Organization `sameAs`).
 */
const SEO_SETTINGS_TAG = 'seo-settings';

@Injectable()
export class SeoSettingsService {
  constructor(
    private readonly repository: SeoSettingsRepository,
    private readonly revalidation: RevalidationNotifier,
  ) {}

  /**
   * Read the SEO settings.
   * Returns an entity with zero-config defaults when the singleton row is
   * unseeded — the public endpoint never 404s.
   */
  async getSettings(): Promise<SeoSettingsEntity> {
    const row = await this.repository.findSettings();

    return row ? SeoSettingsEntity.fromPrisma(row) : SeoSettingsEntity.empty();
  }

  /**
   * Upsert the SEO settings with the provided fields (admin-only), then ask the
   * storefront to revalidate the `seo-settings` cache tag so ISR pages pick up
   * the change immediately (closing the SiteContactSettings revalidation gap for
   * this module — plan 116 gap 5).
   */
  async updateSettings(input: UpsertSeoSettingsInput): Promise<SeoSettingsEntity> {
    const row = await this.repository.upsertSettings(input);

    await this.revalidation.revalidate({ tags: [SEO_SETTINGS_TAG] });

    return SeoSettingsEntity.fromPrisma(row);
  }

  /**
   * SEO-health checklist counts (TASK-269) for the admin `/settings/seo` page.
   * Six cheap COUNTs run in one `Promise.all` on the repository — no caching
   * beyond the client's TanStack Query layer. The "defaults filled" and
   * "noindex" checks are derived client-side from the settings entity the page
   * already fetches, so they are intentionally not part of this payload.
   */
  async getHealth(): Promise<SeoHealthEntity> {
    const counts = await this.repository.getContentSeoCounts();

    return SeoHealthEntity.fromCounts(counts);
  }
}
