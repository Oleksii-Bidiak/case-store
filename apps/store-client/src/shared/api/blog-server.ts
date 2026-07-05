import type {
  BlogPostEntity,
  BlogPostListResponse,
  BlogPostResponseEnvelope,
  BlogCategoryEntity,
  BlogCategoryListResponse,
  BlogPaginationMeta,
} from "@/shared/api/generated/models";

/**
 * Server-only, ISR-tagged fetchers for the published blog (TASK-173).
 *
 * The Orval hooks talk to the API over Axios, which cannot carry Next.js cache
 * tags (`next: { tags }`). To make on-demand revalidation (`revalidateTag`)
 * work, the blog server components read through these tagged `fetch` helpers
 * instead — mirroring `pages-server.ts`. Tags:
 *   - `blog`         → the whole published-blog collection (hub + cron flips)
 *   - `blog:<slug>`  → a single post's detail route
 * The store-api RevalidationNotifier purges these exact tags on admin writes.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/** Cache tag for the whole published-blog collection. */
export const BLOG_COLLECTION_TAG = "blog";

/** Cache tag for a single post's detail route. */
export function blogDetailTag(slug: string): string {
  return `blog:${slug}`;
}

export interface FetchPublishedPostsParams {
  category?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface PublishedPostsResult {
  posts: BlogPostEntity[];
  meta: BlogPaginationMeta;
}

const EMPTY_META: BlogPaginationMeta = {
  total: 0,
  page: 1,
  limit: 0,
  totalPages: 0,
};

/**
 * Fetch a page of PUBLISHED posts (optionally filtered by category slug + a
 * free-text query), tagged for on-demand revalidation. Never throws — returns an
 * empty result on error.
 */
export async function fetchPublishedPosts(
  params: FetchPublishedPostsParams = {},
): Promise<PublishedPostsResult> {
  const search = new URLSearchParams();
  if (params.category) search.set("category", params.category);
  if (params.q) search.set("q", params.q);
  search.set("page", String(params.page ?? 1));
  search.set("limit", String(params.limit ?? 9));

  try {
    const res = await fetch(`${API_BASE_URL}/api/blog?${search.toString()}`, {
      next: { tags: [BLOG_COLLECTION_TAG] },
    });
    if (!res.ok) return { posts: [], meta: EMPTY_META };
    const body = (await res.json()) as BlogPostListResponse;
    return { posts: body.data ?? [], meta: body.meta ?? EMPTY_META };
  } catch {
    return { posts: [], meta: EMPTY_META };
  }
}

/**
 * Fetch a single PUBLISHED post by slug, tagged for on-demand revalidation.
 * Returns null on 404 (draft / scheduled / missing) or any transport error so
 * the caller can render a Next.js `notFound()`.
 */
export async function fetchPublishedPost(
  slug: string,
): Promise<BlogPostEntity | null> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/blog/${encodeURIComponent(slug)}`,
      { next: { tags: [BLOG_COLLECTION_TAG, blogDetailTag(slug)] } },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as BlogPostResponseEnvelope;
    return body.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch all blog categories, tagged with the collection tag so a category
 * rename/delete purge (which sends the `blog` tag) refreshes the chip row.
 */
export async function fetchBlogCategories(): Promise<BlogCategoryEntity[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/blog/categories`, {
      next: { tags: [BLOG_COLLECTION_TAG] },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as BlogCategoryListResponse;
    return body.data ?? [];
  } catch {
    return [];
  }
}
