import type { SiteContactSettingsEntity } from "@/shared/api/generated/models";
import { serverFetch } from "@/shared/api/server-fetch";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/** Cache tag for the singleton site-contact settings — purged by the API on every write. */
export const SITE_CONTACT_TAG = "site-contact";

/**
 * Fetch the admin-managed site-contact settings server-side, tagged for
 * on-demand purging. THE single storefront reader of `/api/site-contact`: the
 * footer (social links / phone / hours), the homepage (Organization `sameAs`
 * schema), `/contact` and `/info` all go through here, so they share one
 * deduped request and — the part that matters — one cache tag.
 *
 * Uses a native tagged `fetch` (not the axios Orval client) so Next.js can apply
 * caching. The store-api `SiteContactService.updateSettings()` purges the
 * `site-contact` tag after every admin write, so edits reach every consumer
 * near-instantly. Returns null on any error; callers fall back to localized
 * defaults.
 *
 * ## Why there is deliberately NO `revalidate` here (TASK-385)
 *
 * This fetch used to carry `revalidate: 3600` as a "floor". It was not a floor —
 * it was the revalidation period of the ENTIRE STOREFRONT. The footer renders in
 * the root layout, Next takes the LOWEST `revalidate` among all fetches on a
 * route, and this was the only one in the app that set a time at all. So all 24
 * prerendered routes inherited an hour, and because ISR is
 * stale-while-revalidate, the first visitor past the hour still got the stale
 * copy and merely triggered the rebuild. On a low-traffic shop that presents as
 * "the site updates at random, somewhere between ten minutes and never" — and it
 * masked a dead revalidation pipeline for weeks, because something did
 * eventually change.
 *
 * The tag is the mechanism; a timer alongside it only adds a slow, invisible
 * second path that hides the fast one failing. If revalidation breaks now, it
 * breaks LOUDLY (see `RevalidationNotifier` and the `/api/revalidate` route,
 * both of which log every rejection since TASK-383) instead of degrading into a
 * random delay.
 *
 * > **Do not copy this body into a page.** `/contact` and `/info` each carried a
 * > private, UNTAGGED duplicate until TASK-345. They still revalidated hourly,
 * > so nothing looked broken — an admin edit simply reached the footer at once
 * > and those two pages up to an hour later. Contact details are legally
 * > required to be current, so a new consumer must import this function.
 */
export async function fetchSiteContactSettings(): Promise<SiteContactSettingsEntity | null> {
  try {
    const res = await serverFetch(`${API_BASE_URL}/api/site-contact`, {
      next: { tags: [SITE_CONTACT_TAG] },
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
