import Link from "next/link";
import { dict, H1_CLASS, H2_CLASS } from "@/shared/config";
import { FallbackImg } from "@/shared/ui";
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
        className="mb-[22px] flex flex-wrap items-center gap-[9px] text-sm text-muted-foreground"
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
          className="inline-flex items-center gap-[7px] rounded-full px-[13px] py-[5px] text-xs font-bold tracking-[0.04em] text-primary"
          style={{
            background:
              "color-mix(in oklab, var(--color-primary) 12%, var(--color-card))",
          }}
        >
          {post.categoryName}
        </span>
        <h1 className={`mt-4 mb-3.5 ${H1_CLASS} text-foreground`}>
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
              <span className="text-sm font-semibold text-foreground">
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
        className="relative mx-auto mt-[26px] h-[380px] max-w-[960px] overflow-hidden rounded-2xl shadow-elevated"
        style={{ background: blogGradient(post.hue) }}
      >
        {/* A cover the CSP blocks or that fails to load leaves the gradient,
            not a broken box (TASK-759). TASK-873: the mockup's
            «[ обкладинка статті ]» caption is gone — it was printed over the
            real photo too. */}
        <FallbackImg
          src={post.coverImageUrl}
          alt=""
          className="size-full object-cover"
        />
      </div>

      {/* Body + TOC */}
      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- fixed+fluid column layout has no named grid-cols-N equivalent */}
      <div className="mt-[38px] grid justify-center gap-11 lg:grid-cols-[minmax(0,760px)_240px]">
        <BlogArticleBody post={post} html={html} />
        <BlogArticleToc sections={sections} />
      </div>

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-[52px]">
          <h2 className={`mb-5 ${H2_CLASS} text-foreground`}>
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
