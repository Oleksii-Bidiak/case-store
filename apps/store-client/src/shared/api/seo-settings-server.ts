import type { SeoSettingsEntity } from "@/shared/api/generated/models";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/** Cache tag for the singleton SEO settings — purged by the API on every write. */
export const SEO_SETTINGS_TAG = "seo-settings";

/**
 * Fetch the admin-managed global SEO settings server-side, tagged for on-demand
 * ISR revalidation. The store-api `SeoSettingsService.updateSettings()` purges
 * the `seo-settings` tag after every admin write, so the storefront picks up
 * changes immediately (root metadata, robots.ts, llms.txt, Organization
 * `sameAs`).
 *
 * Uses a native tagged `fetch` (not the axios Orval client) so Next.js can carry
 * the cache tag. Returns null on any error; callers fall back to the hardcoded
 * localized defaults so every SEO surface renders even when the API is down.
 */
export async function fetchSeoSettings(): Promise<SeoSettingsEntity | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/seo-settings`, {
      next: { tags: [SEO_SETTINGS_TAG] },
    });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as { data?: SeoSettingsEntity };
    return body.data ?? null;
  } catch {
    return null;
  }
}
