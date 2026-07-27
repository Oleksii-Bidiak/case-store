import type { FaqItemEntity } from "@/shared/api/generated/models";
import { serverFetch } from "@/shared/api/server-fetch";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/** Cache tag for the global FAQ list — purged by the API on every write. */
export const FAQ_TAG = "faq";

/**
 * Fetch the admin-managed global FAQ list server-side, tagged for on-demand ISR
 * revalidation. The store-api `FaqService` purges the `faq` tag after every
 * admin write, so the storefront picks up changes immediately (the `/info` FAQ
 * section and the FAQPage JSON-LD on `/info` and the PDP).
 *
 * Uses a native tagged `fetch` (not the axios Orval client) so Next.js can carry
 * the cache tag. Returns `null` on any error; callers fall back to the hardcoded
 * localized `INFO_FAQS` so the FAQ section always renders — even when the API is
 * down.
 */
export async function fetchFaqItems(): Promise<FaqItemEntity[] | null> {
  try {
    const res = await serverFetch(`${API_BASE_URL}/api/faq`, {
      next: { tags: [FAQ_TAG] },
    });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as { data?: FaqItemEntity[] };
    return body.data ?? null;
  } catch {
    return null;
  }
}
