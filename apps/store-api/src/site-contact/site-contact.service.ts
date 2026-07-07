import { Injectable } from '@nestjs/common';
import { SiteContactRepository, UpsertSiteContactInput } from './site-contact.repository';
import { SiteContactSettingsEntity } from './entities';
import { RevalidationNotifier } from '../publishing';

/**
 * Cache tag purged on the storefront after every site-contact write. The
 * storefront's `site-contact-server.ts` fetch is tagged with the same value, so
 * `revalidateTag('site-contact')` refreshes every ISR page that reads it (the
 * footer social links / phone / hours and the homepage Organization `sameAs`).
 */
const SITE_CONTACT_TAG = 'site-contact';

@Injectable()
export class SiteContactService {
  constructor(
    private readonly repository: SiteContactRepository,
    private readonly revalidation: RevalidationNotifier,
  ) {}

  /**
   * Read the contact settings.
   * Returns an entity with all null fields when the singleton row is unseeded —
   * the public endpoint never 404s.
   */
  async getSettings(): Promise<SiteContactSettingsEntity> {
    const row = await this.repository.findSettings();

    return row ? SiteContactSettingsEntity.fromPrisma(row) : SiteContactSettingsEntity.empty();
  }

  /**
   * Upsert the contact settings with the provided fields (admin-only), then ask
   * the storefront to revalidate the `site-contact` cache tag so ISR pages pick
   * up the change immediately (the footer contact block and the homepage
   * Organization `sameAs` JSON-LD) instead of waiting for the 1h ISR window.
   * No business-logic guards are needed: all fields are optional and a singleton
   * cannot conflict on uniqueness.
   */
  async updateSettings(input: UpsertSiteContactInput): Promise<SiteContactSettingsEntity> {
    const row = await this.repository.upsertSettings(input);

    await this.revalidation.revalidate({ tags: [SITE_CONTACT_TAG] });

    return SiteContactSettingsEntity.fromPrisma(row);
  }
}
