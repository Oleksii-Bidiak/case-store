import type { Metadata } from "next";
import Link from "next/link";
import { BlogView, toBlogPostView } from "@/widgets/blog";
import {
  fetchPublishedPosts,
  fetchBlogCategories,
} from "@/shared/api/blog-server";
import { JsonLd } from "@/shared/ui";
import { buildBreadcrumbSchema } from "@/shared/lib/schema";
import { SITE_URL, dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.blogTitle,
  description: dict.meta.blogDescription,
};

const INITIAL_LIMIT = 9;
const LOAD_STEP = 6;

interface BlogPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/** Read a single string value from the resolved search params. */
function readParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Build the `/blog` href for the given category / query / page. */
function blogHref(category: string, query: string, page: number): string {
  const params = new URLSearchParams();
  if (category && category !== "all") params.set("category", category);
  if (query.trim()) params.set("q", query.trim());
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/blog?${qs}` : "/blog";
}

/**
 * Blog hub (/blog). Server component: resolves the `?category=`/`?q=`/`?page=`
 * URL contract, fetches the matching PUBLISHED posts + categories through the
 * ISR-tagged blog fetchers, and renders the interactive listing. "Load more"
 * grows the fetched window by paging, so the grid accumulates on navigation.
 */
export default async function BlogPage({ searchParams }: BlogPageProps) {
  const resolved = await searchParams;
  const category = readParam(resolved.category) ?? "";
  const query = readParam(resolved.q) ?? "";
  const pageNum = Math.max(1, Number(readParam(resolved.page) ?? "1") || 1);

  const isUnfiltered = !category && !query;
  // Fetch one extra when unfiltered so the grid still shows INITIAL_LIMIT cards
  // after the featured hero card is lifted out of the list.
  const featuredExtra = isUnfiltered ? 1 : 0;
  const limit = INITIAL_LIMIT + (pageNum - 1) * LOAD_STEP + featuredExtra;

  const [{ posts, meta }, categories] = await Promise.all([
    fetchPublishedPosts({ category, q: query, page: 1, limit }),
    fetchBlogCategories(),
  ]);

  const views = posts.map(toBlogPostView);

  const featured = isUnfiltered
    ? (views.find((p) => p.featured) ?? views[0] ?? null)
    : null;
  const rest = featured ? views.filter((p) => p.slug !== featured.slug) : views;

  const hasMore = meta.total > views.length;
  const activeCategory = category || "all";

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-[22px] pb-16 sm:px-6">
      <JsonLd
        schema={buildBreadcrumbSchema([
          { name: dict.blog.breadcrumbHome, item: SITE_URL },
          { name: dict.blog.breadcrumb, item: `${SITE_URL}/blog` },
        ])}
      />

      {/* Breadcrumbs */}
      <nav
        aria-label={dict.product.breadcrumbAria}
        className="mb-5 flex items-center gap-[9px] text-[13.5px] text-muted-foreground"
      >
        <Link href="/" className="transition-colors hover:text-foreground">
          {dict.blog.breadcrumbHome}
        </Link>
        <span aria-hidden="true" className="opacity-50">
          ›
        </span>
        <span className="font-medium text-foreground">
          {dict.blog.breadcrumb}
        </span>
      </nav>

      <BlogView
        posts={rest}
        categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
        featured={featured}
        activeCategory={activeCategory}
        query={query}
        hasMore={hasMore}
        nextPageHref={blogHref(activeCategory, query, pageNum + 1)}
      />
    </div>
  );
}
