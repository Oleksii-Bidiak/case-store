import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  BlogArticleView,
  toBlogPostView,
  type BlogPostView,
} from "@/widgets/blog";
import { resolveSlugRedirect } from "@/shared/lib/slug-redirect";
import {
  fetchPublishedPost,
  fetchPublishedPosts,
} from "@/shared/api/blog-server";
import { JsonLd } from "@/shared/ui";
import {
  buildBlogPostingSchema,
  buildBreadcrumbSchema,
} from "@/shared/lib/schema";
import {
  buildOgImages,
  resolveSeo,
  resolveSiteName,
  toMetadataTitle,
} from "@/shared/lib/seo";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";
import { SITE_URL, dict } from "@/shared/config";

const RELATED_LIMIT = 3;

interface BlogArticlePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: BlogArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  // TASK-433: this route did not read the SEO singleton at all, so its
  // `og:site_name` was the only one in the storefront that could not follow an
  // admin rename. `fetchSeoSettings()` is the tagged, per-request-deduped fetch
  // and returns null on failure, so adding it cannot break the article.
  const [post, seo] = await Promise.all([
    fetchPublishedPost(slug),
    fetchSeoSettings(),
  ]);
  if (!post) {
    return { title: dict.meta.blogTitle };
  }

  const canonical = `${SITE_URL}/blog/${post.slug}`;

  // TASK-437 — this was the ONE content route that assembled its metadata by
  // hand, bypassing the shared chain: `title: post.title` (never branded by the
  // template, never truncated) and `description: post.excerpt` — card copy of up
  // to 500 characters, written for the /blog grid, pushed verbatim into <head>.
  // The article now has its own metaTitle/metaDescription, so it runs the same
  // three tiers as every other page: the admin's override → the post's own
  // title/excerpt → the SeoSettings defaults, with the 60/155 truncation and the
  // `%s` brand template applied. With both overrides empty the visible change is
  // only that: branded title, description trimmed to a snippet length.
  const resolved = resolveSeo({
    entityTitle: post.metaTitle,
    entityDescription: post.metaDescription,
    settings: seo,
    content: { name: post.title, description: post.excerpt },
  });
  const siteName = resolveSiteName(seo);
  const title = toMetadataTitle(resolved, {
    settings: seo,
    siteName,
    fallback: post.title,
  });
  const description = resolved.description ?? post.excerpt;

  return {
    title,
    description,
    alternates: { canonical },
    // This block replaces the root layout's `openGraph` wholesale (Next merges
    // metadata shallowly), so it must re-state siteName/locale/images itself —
    // see `buildOgImages`. The post's own `ogImage` (TASK-437) wins over the
    // cover: the cover is cropped for the article header, a link card is
    // 1200×630. Without either, the chain falls to the admin default and then
    // the brand card, so a coverless post is still never image-less.
    openGraph: {
      title: title.absolute,
      description,
      url: canonical,
      siteName,
      locale: "uk_UA",
      type: "article",
      images: buildOgImages({
        entityOgImage: post.ogImage,
        pageImage: post.coverImageUrl,
        defaultOgImage: resolved.ogImage,
      }),
    },
  };
}

/**
 * Blog article (/blog/[slug]). Server component: reads the PUBLISHED post through
 * the ISR-tagged fetcher (draft / scheduled / unknown slugs 404), then fetches a
 * few same-category posts as "related" reads (TASK-173).
 */
export default async function BlogArticlePage({
  params,
}: BlogArticlePageProps) {
  const { slug } = await params;
  // `seo` feeds the BlogPosting `publisher.name` below — the store name, which is
  // admin-managed since TASK-433. Deduped with generateMetadata's identical
  // tagged fetch within the request.
  const [entity, seo] = await Promise.all([
    fetchPublishedPost(slug),
    fetchSeoSettings(),
  ]);
  if (!entity) {
    // TASK-285: an admin may have renamed the slug — serve a permanent (308)
    // redirect to the current address instead of a dead 404.
    const newSlug = await resolveSlugRedirect("BLOG_POST", slug);
    if (newSlug) {
      permanentRedirect(`/blog/${newSlug}`);
    }
    notFound();
  }

  const post = toBlogPostView(entity);

  const related = await fetchRelatedPosts(post.slug, post.categorySlug);

  const canonical = `${SITE_URL}/blog/${post.slug}`;

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pt-[22px] pb-16 sm:px-6">
      <JsonLd
        schema={buildBreadcrumbSchema([
          { name: dict.blog.breadcrumbHome, item: SITE_URL },
          { name: dict.blog.breadcrumb, item: `${SITE_URL}/blog` },
          { name: post.title, item: canonical },
        ])}
      />
      <JsonLd
        schema={buildBlogPostingSchema({
          url: canonical,
          headline: post.title,
          description: post.excerpt,
          datePublished: post.publishedAt ?? undefined,
          authorName: post.author,
          siteName: resolveSiteName(seo),
        })}
      />

      <BlogArticleView post={post} related={related} />
    </div>
  );
}

/**
 * The three posts under "Читайте також" (TASK-436).
 *
 * Same category first, because a reader who finished a charger guide wants
 * another charger guide. But a thin category used to produce a block of one
 * card, or none at all — the section simply looked broken on a young blog. So a
 * short category result is topped up with the newest posts from anywhere, in
 * publication order, and only the current article and duplicates are removed.
 *
 * Both reads pass `includeUnlisted: false`: "Читайте також" is a list, and a
 * post the owner kept out of the feed should not reappear here through the side
 * door. Both are tagged `blog`, so publishing anything purges this block too.
 */
async function fetchRelatedPosts(
  currentSlug: string,
  categorySlug: string,
): Promise<BlogPostView[]> {
  const { posts: sameCategory } = await fetchPublishedPosts({
    category: categorySlug,
    // One extra: the current article is almost always in its own category.
    limit: RELATED_LIMIT + 1,
    includeUnlisted: false,
  });

  const picked = sameCategory
    .map(toBlogPostView)
    .filter((p) => p.slug !== currentSlug)
    .slice(0, RELATED_LIMIT);

  if (picked.length >= RELATED_LIMIT) return picked;

  // Top-up pass. Ask for enough that the current article and everything already
  // picked can all be discarded and still leave three.
  const { posts: latest } = await fetchPublishedPosts({
    limit: RELATED_LIMIT + picked.length + 1,
    includeUnlisted: false,
  });

  const seen = new Set([currentSlug, ...picked.map((p) => p.slug)]);
  for (const entity of latest) {
    if (picked.length >= RELATED_LIMIT) break;
    if (seen.has(entity.slug)) continue;
    seen.add(entity.slug);
    picked.push(toBlogPostView(entity));
  }

  return picked;
}
