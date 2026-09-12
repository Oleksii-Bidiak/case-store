import type {
  PageEntity,
  PageEntityKind,
  PageListResponse,
  PageResponseEnvelope,
} from "@/shared/api/generated/models";
import { serverFetch } from "@/shared/api/server-fetch";

/**
 * Server-only, ISR-tagged fetchers for published static pages (TASK-187).
 *
 * The Orval hooks talk to the API over Axios, which cannot carry Next.js cache
 * tags (`next: { tags }`). To make on-demand revalidation (`revalidateTag`)
 * work, the Page-driven server components read through these tagged `fetch`
 * helpers instead — the same server-side raw-fetch/ISR pattern already used for
 * site-contact on the /info and /contact pages. Tags:
 *   - `pages`          → the whole published-pages collection (hub + cron flips)
 *   - `page:<slug>`    → a single page's detail route
 * The store-api RevalidationNotifier purges these exact tags on admin writes.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/** Cache tag for the whole published-pages collection. */
export const PAGES_COLLECTION_TAG = "pages";

/** Cache tag for a single page's detail route. */
export function pageDetailTag(slug: string): string {
  return `page:${slug}`;
}

// Mirrors the API's max `limit` (100); the list is small so one page suffices.
const PAGE_SIZE = 100;

/**
 * Fetch a single PUBLISHED page by slug, tagged for on-demand revalidation.
 * Returns null on 404 (draft / scheduled / missing) or any transport error so
 * the caller can render a Next.js `notFound()`.
 *
 * `kind` is REQUIRED (TASK-435): every caller is a route that serves exactly one
 * kind, and the API 404s a mismatch, so `/legal/<slug>` can never render a help
 * page and `/info/<slug>` can never render a legal document. Making the argument
 * mandatory is the point — a caller that forgot it would silently re-open that
 * hole.
 */
export async function fetchPublishedPage(
  slug: string,
  kind: PageEntityKind,
): Promise<PageEntity | null> {
  try {
    const res = await serverFetch(
      `${API_BASE_URL}/api/pages/${encodeURIComponent(slug)}?kind=${kind}`,
      { next: { tags: [PAGES_COLLECTION_TAG, pageDetailTag(slug)] } },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as PageResponseEnvelope;
    return body.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch all PUBLISHED pages of one kind (first page of up to {@link PAGE_SIZE}),
 * tagged for on-demand revalidation. Never throws — returns an empty list on
 * error. The kind keeps the `/legal` hub listing legal documents only and the
 * `/info` one help pages only.
 */
export async function fetchPublishedPages(
  kind: PageEntityKind,
): Promise<PageEntity[]> {
  try {
    const res = await serverFetch(
      `${API_BASE_URL}/api/pages?kind=${kind}&page=1&limit=${PAGE_SIZE}`,
      { next: { tags: [PAGES_COLLECTION_TAG] } },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as PageListResponse;
    return body.data ?? [];
  } catch {
    return [];
  }
}
