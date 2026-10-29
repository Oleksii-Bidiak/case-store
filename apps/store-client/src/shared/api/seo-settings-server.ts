import { PHASE_PRODUCTION_BUILD } from "next/constants";
import type { SeoSettingsEntity } from "@/shared/api/generated/models";
import { serverFetch } from "@/shared/api/server-fetch";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/** Cache tag for the singleton SEO settings — purged by the API on every write. */
export const SEO_SETTINGS_TAG = "seo-settings";

/**
 * The SEO settings could not be read (non-200, timeout, network). Distinct from
 * "nothing saved yet": the API answers that with a 200 and a zero-config entity.
 */
export class SeoSettingsUnavailableError extends Error {
  constructor(reason: string) {
    super(`SEO settings read failed: ${reason}`);
    this.name = "SeoSettingsUnavailableError";
  }
}

/**
 * The one request behind both readers below. Throws
 * {@link SeoSettingsUnavailableError} on any failure.
 *
 * ## Why `cache: "force-cache"` (TASK-1988)
 *
 * A fetch with only `next.tags` is NOT cached at runtime in Next 16 ("auto no
 * cache" in `patch-fetch.js`), so every page render called the API again. The
 * root layout also reads the `banners` tag, so one banner or promo-tile write
 * re-rendered EVERY page, each of them spending the shared SSR rate-limit bucket
 * on this request (TASK-393), until the API answered 429.
 *
 * With `force-cache` the response lives in the Data Cache under
 * `seo-settings` alone: a `banners` purge re-renders pages from that entry
 * without touching the API, and only an admin SEO/logo write
 * (`SeoSettingsService.updateSettings()` → `revalidateTag('seo-settings')`)
 * refetches it. Next stores ONLY `status === 200` responses, and concurrent
 * renders wait on a per-key lock, so a purge costs one request, not one per
 * page. Deliberately no `revalidate` — a timer here would become the whole
 * storefront's ISR period (see site-contact-server.ts, TASK-385).
 *
 * Uses a native tagged `fetch` (not the axios Orval client) so Next.js can carry
 * the cache directives.
 */
async function requestSeoSettings(): Promise<SeoSettingsEntity | null> {
  let res: Response;
  try {
    res = await serverFetch(`${API_BASE_URL}/api/seo-settings`, {
      cache: "force-cache",
      next: { tags: [SEO_SETTINGS_TAG] },
    });
  } catch (error) {
    throw new SeoSettingsUnavailableError(
      error instanceof Error ? error.name : "network error",
    );
  }
  if (!res.ok) {
    throw new SeoSettingsUnavailableError(`HTTP ${res.status}`);
  }
  try {
    const body = (await res.json()) as { data?: SeoSettingsEntity };
    return body.data ?? null;
  } catch {
    throw new SeoSettingsUnavailableError("malformed body");
  }
}

/**
 * Fetch the admin-managed global SEO settings for the SEO surfaces — page
 * metadata, robots.ts, sitemap, llms.txt, the merchant feed, the manifest.
 * Returns null on any error; callers fall back to the hardcoded localized
 * defaults so every SEO surface renders even when the API is down.
 *
 * Do NOT use this for the store's visible branding (logo, wordmark): there a
 * failure must not look like "no logo" — see {@link fetchSeoSettingsForChrome}.
 */
export async function fetchSeoSettings(): Promise<SeoSettingsEntity | null> {
  try {
    return await requestSeoSettings();
  } catch {
    return null;
  }
}

/**
 * The root layout's read: the uploaded logo, the wordmark and the root
 * metadata every page inherits (TASK-1988).
 *
 * A failed read is NOT "no settings": rendering the placeholder "C CaseStore"
 * over it is what ISR then stored and served until the next purge. So at
 * runtime it throws. What the visitor gets on a cold-cache failure (the only
 * case left — a warm Data Cache entry never reaches the API):
 *   - an ISR page being regenerated: Next re-stores the previous page with a
 *     3–30 s revalidate and retries (`response-cache/index.js`), so the old,
 *     correct logo stays. A tag-expired page is a blocking render, so that one
 *     request gets the error page; the next is served the kept copy.
 *   - a dynamic route: that request gets the error page; a reload retries.
 * We accept a rare, transient error page over a wrong brand cached for days.
 *
 * Only `next build` degrades to null — no earlier copy exists and the build must
 * not need a live API (TASK-327); same rule as `homeBlocksOrDefault`.
 */
export async function fetchSeoSettingsForChrome(
  phase: string | undefined = process.env.NEXT_PHASE,
): Promise<SeoSettingsEntity | null> {
  try {
    return await requestSeoSettings();
  } catch (error) {
    if (phase === PHASE_PRODUCTION_BUILD) {
      return null;
    }
    throw error;
  }
}
