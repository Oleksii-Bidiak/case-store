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
 * Read one page off the API: the page, `null` for a genuine 404, and a THROW for
 * everything else (TASK-793).
 *
 * The two detail readers below used to return `null` on ANY failure, and their
 * routes turn `null` into `notFound()` — so a 502, a timeout or a restarting API
 * answered HTTP 404 on canonical `/legal/<slug>` and `/info/<slug>` URLs taken
 * straight from the sitemap. A crawler that sees that drops the URL; an outage
 * must surface as a 5xx the crawler retries. Same rule the compat landing page
 * has followed since TASK-490 (`catalog/[category]/[device]/page.tsx`).
 */
async function readPage(
  url: string,
  tags: string[],
): Promise<PageEntity | null> {
  const res = await serverFetch(url, { next: { tags } });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Page read failed: ${res.status} ${url}`);
  }
  const body = (await res.json()) as PageResponseEnvelope;
  return body.data ?? null;
}

/**
 * Fetch a single PUBLISHED page by slug, tagged for on-demand revalidation.
 * Returns null on a 404 (draft / scheduled / missing / wrong kind) so the caller
 * can render a Next.js `notFound()`; THROWS on any other failure (5xx, timeout,
 * refused connection) so an outage is a 5xx, not a 404 — see {@link readPage}.
 * A caller that must render regardless (a hub's meta tags, the `/info` section
 * copy) catches for itself.
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
  return readPage(
    `${API_BASE_URL}/api/pages/${encodeURIComponent(slug)}?kind=${kind}`,
    [PAGES_COLLECTION_TAG, pageDetailTag(slug)],
  );
}

/**
 * Fetch a single PUBLISHED page by slug WITHOUT narrowing to a kind — the
 * deliberate exception to the rule above.
 *
 * Used by the two document routes only, and only after their own kind-narrowed
 * read has already missed: at that point the question is no longer "may this
 * route render this page" (the answer is no) but "did this page move to the
 * other surface, and where should the stale URL point". The result is never
 * rendered — it is turned into a 308 by `pageCanonicalPath()` — so this cannot
 * re-open the wrong-kind hole `fetchPublishedPage`'s mandatory argument closes.
 *
 * HUB rows stay excluded by the API itself, whatever we ask for.
 *
 * Same contract as {@link fetchPublishedPage}: null only for a 404, a throw for
 * anything else. Its one caller, `resolvePageRedirect`, decides what an outage
 * means there.
 */
export async function fetchPublishedPageAnyKind(
  slug: string,
): Promise<PageEntity | null> {
  return readPage(`${API_BASE_URL}/api/pages/${encodeURIComponent(slug)}`, [
    PAGES_COLLECTION_TAG,
    pageDetailTag(slug),
  ]);
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
