import Link from "next/link";
import { dict } from "@/shared/config";
import { authorInitial, blogGradient, type BlogPostView } from "../model/posts";

/**
 * BlogFeaturedCard — the wide two-column hero card for the "хіт тижня" post,
 * shown only in the unfiltered view. Presentational; links to the article page.
 */
export function BlogFeaturedCard({ post }: { post: BlogPostView }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      // eslint-disable-next-line tailwindcss/no-arbitrary-value -- fixed+fluid column layout has no named grid-cols-N equivalent
      className="mb-[34px] grid overflow-hidden rounded-[20px] border border-border bg-card no-underline shadow-card transition-shadow hover:shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-[1.1fr_1fr]"
    >
      <div
        className="relative min-h-[320px]"
        style={{ background: blogGradient(post.hue) }}
      >
        <span className="absolute left-[18px] top-[18px] rounded-full bg-card px-[13px] py-1.5 text-[12.5px] font-bold text-foreground">
          {post.categoryName}
        </span>
        <span className="absolute bottom-[18px] right-[18px] rounded-full bg-black/35 px-3 py-[5px] text-xs font-semibold text-white backdrop-blur-[4px]">
          {dict.blog.featuredBadge}
        </span>
      </div>
      <div className="flex flex-col justify-center px-10 py-[38px]">
        <h2 className="mb-3 font-display text-[27px] font-bold leading-[1.18] tracking-[-0.02em] text-foreground">
          {post.title}
        </h2>
        <p className="mb-[22px] text-[15px] leading-[1.6] text-muted-foreground">
          {post.excerpt}
        </p>
        <div className="mt-auto flex items-center gap-3">
          <span className="inline-flex size-[38px] items-center justify-center rounded-full bg-primary font-display text-[15px] font-bold text-primary-foreground">
            {authorInitial(post.author)}
          </span>
          <div className="flex flex-col leading-[1.3]">
            <span className="text-[13.5px] font-semibold text-foreground">
              {post.author}
            </span>
            <span className="text-[12.5px] text-muted-foreground">
              {post.date} · {post.read}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
