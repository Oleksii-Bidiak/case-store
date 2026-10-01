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
import { buildListingMetadata } from "@/shared/lib/seo";
import { buildHubMetadata } from "@/shared/lib/seo/server";
import { SITE_URL, dict, PAGE_CONTAINER } from "@/shared/config";

// TASK-435 — title/description come from the `blog` HUB page row so the owner
// can edit them in the panel; the dictionary strings remain the fallback.
//
// TASK-524 — canonical/robots follow the catalogue's listing policy (plan 143).
// Since TASK-417 each `?page=N` is a disjoint slice of the archive, so pointing
// it at page 1 (what TASK-432 did while pages still accumulated) told crawlers
// the archive's older articles were duplicates of the newest nine; each page is
// now its own canonical. A `?q=` search or a `?category=` chip is a narrowed
// view of the same posts — `noindex, follow`, no canonical, exactly like a
// filtered catalogue listing: its links are still followed, it is not indexed.
export async function generateMetadata({
  searchParams,
}: BlogPageProps): Promise<Metadata> {
  const resolved = await searchParams;
  const isFiltered = Boolean(
    readParam(resolved.q)?.trim() || readParam(resolved.category),
  );
  const listing = buildListingMetadata({
    basePath: "/blog",
    page: Number(readParam(resolved.page)),
  });

  return buildHubMetadata({
    slug: "blog",
    canonical: `${SITE_URL}${isFiltered ? "/blog" : (listing.canonicalPath ?? "/blog")}`,
    fallbackTitle: dict.meta.blogTitle,
    fallbackDescription: dict.meta.blogDescription,
    robots: isFiltered ? { index: false, follow: true } : undefined,
  });
}

/**
 * Posts per page. One size for EVERY page (TASK-417): the hub used to grow a
 * single accumulating window — `?page=3` meant "the first 21 posts" — which is
 * why it could never carry numbered pages. On the unfiltered first page one of
 * these nine is lifted out as the featured hero rather than fetched on top of
 * them, so page 2 starts exactly where page 1 ended. With no post marked
 * featured there is no hero at all (TASK-833) and page 1 shows nine cards.
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

  // TASK-833 — only a post the editor actually marked «Головна стаття тижня».
  // The hero used to fall back to the newest post, so the hub always had one
  // and marking an article changed nothing visible — the switch looked broken.
  // The API sorts featured posts first, so a marked post is always on page 1.
  const featured =
    isUnfiltered && pageNum === 1
      ? (views.find((p) => p.featured) ?? null)
      : null;
  const rest = featured ? views.filter((p) => p.slug !== featured.slug) : views;

  const totalPages = Math.max(1, meta.totalPages || 1);
  const activeCategory = category || "all";

  // TASK-556 — the articles on this page, in the order they are shown (hero
  // first). The posts are server-fetched, so the list is in the first HTML, as
  // a crawler needs it; an empty page gets no ItemList rather than an empty one.
  const listed = featured ? [featured, ...rest] : rest;

  return (
    <div className={`${PAGE_CONTAINER} pt-[22px] pb-16`}>
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
        className="mb-5 flex items-center gap-[9px] text-sm text-muted-foreground"
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
