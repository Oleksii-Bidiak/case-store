import type { Metadata } from "next";
import Link from "next/link";
import { BlogView, toBlogPostView } from "@/widgets/blog";
import {
  fetchPublishedPosts,
  fetchBlogCategories,
} from "@/shared/api/blog-server";
import { JsonLd } from "@/shared/ui";
import {
  buildBreadcrumbSchema,
  buildItemListSchema,
} from "@/shared/lib/schema";
import { buildHubMetadata } from "@/shared/lib/seo";
import { SITE_URL, dict } from "@/shared/config";

// TASK-432 — /blog was the only storefront route with no `alternates.canonical`,
// so every `?category=`/`?q=`/`?page=` variant of the hub self-canonicalized and
// competed with the clean URL. The hub canonicalizes onto itself; the paged and
// filtered views are navigation, not separate documents.
//
// TASK-435 — title/description come from the `blog` HUB page row so the owner
// can edit them in the panel; the dictionary strings remain the fallback. The
// canonical is unchanged.
export function generateMetadata(): Promise<Metadata> {
  return buildHubMetadata({
    slug: "blog",
    canonical: `${SITE_URL}/blog`,
    fallbackTitle: dict.meta.blogTitle,
    fallbackDescription: dict.meta.blogDescription,
  });
}

/**
 * Posts per page. One size for EVERY page (TASK-417): the hub used to grow a
 * single accumulating window — `?page=3` meant "the first 21 posts" — which is
 * why it could never carry numbered pages. On the unfiltered first page one of
 * these nine is lifted out as the featured hero rather than fetched on top of
 * them, so page 2 starts exactly where page 1 ended.
 */
const PAGE_SIZE = 9;

interface BlogPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/** Read a single string value from the resolved search params. */
function readParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Blog hub (/blog). Server component: resolves the `?category=`/`?q=`/`?page=`
 * URL contract, fetches the matching PUBLISHED posts + categories through the
 * ISR-tagged blog fetchers, and renders the interactive listing. Each page is
 * one disjoint slice of the archive, addressable on its own URL.
 */
export default async function BlogPage({ searchParams }: BlogPageProps) {
  const resolved = await searchParams;
  const category = readParam(resolved.category) ?? "";
  const query = readParam(resolved.q) ?? "";
  const pageNum = Math.max(1, Number(readParam(resolved.page) ?? "1") || 1);

  // The featured hero is lifted out of the FIRST page of the unfiltered hub
  // only: under a category chip or a search it would be an arbitrary article
  // promoted above the results the reader actually asked for.
  const isUnfiltered = !category && !query;

  const [{ posts, meta }, categories] = await Promise.all([
    // develop paginates the hub (TASK-417); this branch keeps unlisted posts out
    // of it (TASK-436). A list surface wants both.
    fetchPublishedPosts({
      category,
      q: query,
      page: pageNum,
      limit: PAGE_SIZE,
      includeUnlisted: false,
    }),
    fetchBlogCategories(),
  ]);

  const views = posts.map(toBlogPostView);

  const featured =
    isUnfiltered && pageNum === 1
      ? (views.find((p) => p.featured) ?? views[0] ?? null)
      : null;
  const rest = featured ? views.filter((p) => p.slug !== featured.slug) : views;

  const totalPages = Math.max(1, meta.totalPages || 1);
  const activeCategory = category || "all";

  // TASK-556 — the articles on this page, in the order they are shown (hero
  // first). The posts are server-fetched, so the list is in the first HTML, as
  // a crawler needs it; an empty page gets no ItemList rather than an empty one.
  const listed = featured ? [featured, ...rest] : rest;

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-[22px] pb-16 sm:px-6">
      <JsonLd
        schema={buildBreadcrumbSchema([
          { name: dict.blog.breadcrumbHome, item: SITE_URL },
          { name: dict.blog.breadcrumb, item: `${SITE_URL}/blog` },
        ])}
      />
      {listed.length > 0 && (
        <JsonLd
          schema={buildItemListSchema(
            listed.map((post) => ({
              name: post.title,
              url: `${SITE_URL}/blog/${post.slug}`,
              image: post.coverImageUrl
                ? new URL(post.coverImageUrl, SITE_URL).toString()
                : undefined,
            })),
            { itemType: "BlogPosting" },
          )}
        />
      )}

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
        page={pageNum}
        totalPages={totalPages}
      />
    </div>
  );
}
