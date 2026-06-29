import { Injectable } from '@nestjs/common';
import { SiteContactRepository, UpsertSiteContactInput } from './site-contact.repository';
import { SiteContactSettingsEntity } from './entities';

@Injectable()
export class SiteContactService {
  constructor(private readonly repository: SiteContactRepository) {}

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
   * Upsert the contact settings with the provided fields (admin-only).
   * No business-logic guards are needed: all fields are optional and a singleton
   * cannot conflict on uniqueness.
   */
  async updateSettings(input: UpsertSiteContactInput): Promise<SiteContactSettingsEntity> {
    const row = await this.repository.upsertSettings(input);

    return SiteContactSettingsEntity.fromPrisma(row);
  }
}
