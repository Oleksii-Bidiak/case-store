import type { SiteContactSettingsEntity } from "@/shared/api/generated/models";
import { serverFetch } from "@/shared/api/server-fetch";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/** Cache tag for the singleton site-contact settings — purged by the API on every write. */
export const SITE_CONTACT_TAG = "site-contact";

/**
 * Fetch the admin-managed site-contact settings server-side with a 1-hour ISR
 * cache. Shared by the footer (social links / phone / hours) and the homepage
 * (Organization `sameAs` schema) so both read one deduped, cached request.
 *
 * Uses a native tagged `fetch` (not the axios Orval client) so Next.js can apply
 * caching. The store-api `SiteContactService.updateSettings()` purges the
 * `site-contact` tag after every admin write, so edits reach the live footer /
 * Organization `sameAs` near-instantly; the 1h `revalidate` stays as the floor.
 * Returns null on any error; callers fall back to localized defaults.
 */
export async function fetchSiteContactSettings(): Promise<SiteContactSettingsEntity | null> {
  try {
    const res = await serverFetch(`${API_BASE_URL}/api/site-contact`, {
      next: { revalidate: 3600, tags: [SITE_CONTACT_TAG] },
    });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as { data?: SiteContactSettingsEntity };
    return body.data ?? null;
  } catch {
    return null;
  }
}
