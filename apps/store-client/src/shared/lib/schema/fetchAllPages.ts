import { pageControllerFindAll } from "@/shared/api/generated/pages/pages";
import type { PageEntity } from "@/shared/api/generated/models";

// Must not exceed the API's max `limit` (100), or the first request fails with
// 400 and collapses the sitemap to static-only.
const PAGE_SIZE = 100;

/**
 * Fetch every PUBLISHED static page across all pages using the Orval plain
 * fetcher (server-only — NOT a React hook). Used by app/sitemap.ts.
 *
 * Throws on HTTP error; the caller (sitemap) wraps this in try/catch and falls
 * back to its other routes so a fetch failure never breaks the route.
 */
export async function fetchAllPublishedPages(): Promise<PageEntity[]> {
  const first = await pageControllerFindAll({ page: 1, limit: PAGE_SIZE });

  const pages: PageEntity[] = [...first.data];
  const totalPages = first.meta.totalPages;

  for (let page = 2; page <= totalPages; page++) {
    const next = await pageControllerFindAll({ page, limit: PAGE_SIZE });
    pages.push(...next.data);
  }

  return pages;
}
