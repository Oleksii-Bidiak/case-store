import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogArticleView, toBlogPostView } from "@/widgets/blog";
import {
  fetchPublishedPost,
  fetchPublishedPosts,
} from "@/shared/api/blog-server";
import { JsonLd } from "@/shared/ui";
import {
  buildBlogPostingSchema,
  buildBreadcrumbSchema,
} from "@/shared/lib/schema";
import { SITE_URL, SITE_NAME, dict } from "@/shared/config";

const RELATED_LIMIT = 3;

interface BlogArticlePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: BlogArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await fetchPublishedPost(slug);
  if (!post) {
    return { title: dict.meta.blogTitle };
  }

  const canonical = `${SITE_URL}/blog/${post.slug}`;
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      url: canonical,
      type: "article",
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
  const entity = await fetchPublishedPost(slug);
  if (!entity) {
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
          siteName: SITE_NAME,
        })}
      />

      <BlogArticleView post={post} related={related} />
    </div>
  );
}
