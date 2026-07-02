import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  BlogArticleView,
  BLOG_POSTS,
  blogPublishedAt,
  getBlogPost,
} from "@/widgets/blog";
import { JsonLd } from "@/shared/ui";
import {
  buildBlogPostingSchema,
  buildBreadcrumbSchema,
} from "@/shared/lib/schema";
import { SITE_URL, SITE_NAME, dict } from "@/shared/config";

// The posts are a static seed (no Blog backend yet — TASK-170), so every article
// is prerendered and any unknown slug 404s.
export const dynamicParams = false;

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

interface BlogArticlePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: BlogArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
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

export default async function BlogArticlePage({
  params,
}: BlogArticlePageProps) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) {
    notFound();
  }

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
          datePublished: blogPublishedAt(post.slug),
          authorName: post.author,
          siteName: SITE_NAME,
        })}
      />

      <BlogArticleView post={post} />
    </div>
  );
}
