import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { BlogArticleView, toBlogPostView } from "@/widgets/blog";
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
import { buildOgImages, resolveSiteName } from "@/shared/lib/seo";
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

  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical },
    // This block replaces the root layout's `openGraph` wholesale (Next merges
    // metadata shallowly), so it must re-state siteName/locale/images itself —
    // see `buildOgImages`. The article's own cover art is the right card for a
    // shared link; `buildOgImages` falls back to the admin default and then the
    // brand card, so a coverless post is still never image-less.
    openGraph: {
      title: post.title,
      description: post.excerpt,
      url: canonical,
      siteName: resolveSiteName(seo),
      locale: "uk_UA",
      type: "article",
      images: buildOgImages({ pageImage: post.coverImageUrl }),
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

  // Same-category related posts (fetch a few extra to drop the current one).
  const { posts: relatedEntities } = await fetchPublishedPosts({
    category: post.categorySlug,
    limit: RELATED_LIMIT + 1,
  });
  const related = relatedEntities
    .map(toBlogPostView)
    .filter((p) => p.slug !== post.slug)
    .slice(0, RELATED_LIMIT);

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
