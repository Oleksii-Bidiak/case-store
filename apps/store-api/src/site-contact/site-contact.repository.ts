import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { SiteContactSettings } from '@prisma/client';

/**
 * Well-known fixed ID for the singleton site-contact settings row.
 *
 * There is EXACTLY ONE row in `site_contact_settings`, always identified by this
 * constant. The seed creates/upserts it; the repository reads and upserts it.
 * Shared with `prisma/seed.ts` (TASK-154-F).
 */
export const SINGLETON_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Fields that may be written to the singleton contact-settings row.
 * All are optional — only provided fields are updated.
 */
export interface UpsertSiteContactInput {
  email?: string | null;
  phone?: string | null;
  workingHours?: string | null;
  viberLink?: string | null;
  telegramLink?: string | null;
  instagramLink?: string | null;
}

@Injectable()
export class SiteContactRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read the singleton contact-settings row.
   * Returns the row or null if it has not been seeded yet.
   */
  findSettings(): Promise<SiteContactSettings | null> {
    return this.prisma.siteContactSettings.findUnique({
      where: { id: SINGLETON_ID },
    });
  }

  /**
   * Upsert the singleton contact-settings row.
   * Creates the row (with the well-known ID) on first write, updates it
   * thereafter. Only the provided fields are written.
   */
  upsertSettings(data: UpsertSiteContactInput): Promise<SiteContactSettings> {
    return this.prisma.siteContactSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: { ...data },
    });
  }
}
