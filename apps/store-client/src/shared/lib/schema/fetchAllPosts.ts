import { blogControllerFindAll } from "@/shared/api/generated/blog/blog";
import type { BlogPostEntity } from "@/shared/api/generated/models";

// Must not exceed the API's max `limit` (100), or the first request fails with
// 400 and the blog drops out of the sitemap altogether.
const PAGE_SIZE = 100;

/**
 * Fetch every PUBLISHED blog post across all pages using the Orval plain fetcher
 * (server-only — NOT a React hook). Used by app/sitemap.ts (TASK-551).
 *
 * Why not `fetchPublishedPosts` from `blog-server.ts`: that one reads ONE page
 * and returns an empty result on any failure — right for the `/blog` grid, which
 * must render something, and wrong for the sitemap twice over. The 101st post
 * fell out of the index without a trace, and an API outage produced a sitemap
 * that silently listed no articles at all.
 *
 * `includeUnlisted: true` — a post kept out of the feed (TASK-436) is still a
 * public document; the sitemap is the one surface that must list it.
 *
 * Throws on HTTP error; the caller (sitemap) wraps this in try/catch, reports to
 * Sentry and falls back to its other routes.
 */
export async function fetchAllPublishedPosts(): Promise<BlogPostEntity[]> {
  const first = await blogControllerFindAll({
    page: 1,
    limit: PAGE_SIZE,
    includeUnlisted: true,
  });

  const posts: BlogPostEntity[] = [...first.data];
  const totalPages = first.meta.totalPages;

  for (let page = 2; page <= totalPages; page++) {
    const next = await blogControllerFindAll({
      page,
      limit: PAGE_SIZE,
      includeUnlisted: true,
    });
    posts.push(...next.data);
  }

  return posts;
}
