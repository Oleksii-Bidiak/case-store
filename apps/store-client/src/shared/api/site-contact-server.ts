import type { SiteContactSettingsEntity } from "@/shared/api/generated/models";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/**
 * Fetch the admin-managed site-contact settings server-side with a 1-hour ISR
 * cache. Shared by the footer (social links / phone / hours) and the homepage
 * (Organization `sameAs` schema) so both read one deduped, cached request.
 *
 * Uses a native tagged `fetch` (not the axios Orval client) so Next.js can apply
 * `revalidate` caching — contact info changes at most a few times a year.
 * Returns null on any error; callers fall back to localized defaults.
 */
export async function fetchSiteContactSettings(): Promise<SiteContactSettingsEntity | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/site-contact`, {
      next: { revalidate: 3600 },
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
