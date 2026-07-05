import Link from "next/link";
import { dict } from "@/shared/config";
import {
  authorInitial,
  blogGradient,
  buildArticleToc,
  formatBlogLongDate,
  type BlogPostView,
} from "../model/posts";
import { BlogArticleBody } from "./blog-article-body";
import { BlogArticleShare } from "./blog-article-share";
import { BlogArticleToc } from "./blog-article-toc";
import { BlogRelatedCard } from "./blog-related-card";

/**
 * BlogArticleView — the full blog article layout (breadcrumb, head + share,
 * cover, body + sticky TOC, related posts). The head/cover/meta and the body are
 * all driven by the API `post`; the TOC anchors are derived from the body's
 * `<h2>` headings (TASK-173).
 */
export function BlogArticleView({
  post,
  related,
}: {
  post: BlogPostView;
  related: BlogPostView[];
}) {
  const { html, sections } = buildArticleToc(post.content);
  const dateLabel = formatBlogLongDate(post.publishedAt);

  return (
    <>
      {/* Breadcrumbs */}
      <nav
        aria-label={dict.product.breadcrumbAria}
        className="mb-[22px] flex flex-wrap items-center gap-[9px] text-[13.5px] text-muted-foreground"
      >
        <Link href="/" className="transition-colors hover:text-foreground">
          {dict.blog.breadcrumbHome}
        </Link>
        <span aria-hidden="true" className="opacity-50">
          ›
        </span>
        <Link href="/blog" className="transition-colors hover:text-foreground">
          {dict.blog.breadcrumb}
        </Link>
        <span aria-hidden="true" className="opacity-50">
          ›
        </span>
        <span className="font-medium text-foreground">{post.title}</span>
      </nav>

      {/* Article head */}
      <div className="mx-auto max-w-[760px]">
        <span
          className="inline-flex items-center gap-[7px] rounded-full px-[13px] py-[5px] text-[12.5px] font-bold tracking-[0.04em] text-primary"
          style={{
            background:
              "color-mix(in oklab, var(--color-primary) 12%, var(--color-card))",
          }}
        >
          {post.categoryName}
        </span>
        <h1 className="mt-4 mb-3.5 font-display text-[36px] font-bold leading-[1.12] tracking-[-0.025em] text-foreground">
          {post.title}
        </h1>
        <p className="mb-[22px] text-[18px] leading-[1.55] text-muted-foreground">
          {post.excerpt}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-[22px]">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-11 items-center justify-center rounded-full bg-primary font-display text-base font-bold text-primary-foreground">
              {authorInitial(post.author)}
            </span>
            <div className="flex flex-col leading-[1.35]">
              <span className="text-[14.5px] font-semibold text-foreground">
                {post.author}
              </span>
              <span className="text-[13px] text-muted-foreground">
                {dateLabel}
                {post.read
                  ? ` · ${post.read} ${dict.blog.article.readSuffix}`
                  : ""}
              </span>
            </div>
          </div>
          <BlogArticleShare />
        </div>
      </div>

      {/* Cover */}
      <div
        className="relative mx-auto mt-[26px] h-[380px] max-w-[960px] overflow-hidden rounded-[20px] shadow-[var(--shadow-elevated)]"
        style={{ background: blogGradient(post.hue) }}
      >
        {post.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.coverImageUrl}
            alt=""
            className="size-full object-cover"
          />
        )}
        <span className="absolute right-[18px] bottom-4 font-mono text-xs text-white/70">
          {dict.blog.article.coverCaption}
        </span>
      </div>

      {/* Body + TOC */}
      <div className="mt-[38px] grid justify-center gap-11 lg:grid-cols-[minmax(0,760px)_240px]">
        <BlogArticleBody post={post} html={html} />
        <BlogArticleToc sections={sections} />
      </div>

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-[52px]">
          <h2 className="mb-5 font-display text-[23px] font-bold tracking-[-0.02em] text-foreground">
            {dict.blog.article.relatedHeading}
          </h2>
          <div className="grid gap-[22px] [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
            {related.map((r) => (
              <BlogRelatedCard key={r.slug} post={r} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
