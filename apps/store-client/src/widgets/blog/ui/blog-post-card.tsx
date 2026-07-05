import Link from "next/link";
import { authorInitial, blogGradient, type BlogPostView } from "../model/posts";

/**
 * BlogPostCard — a single article card in the responsive grid. Presentational;
 * links to the article page. The cover is a token-derived placeholder gradient
 * when the post has no cover image.
 */
export function BlogPostCard({ post }: { post: BlogPostView }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="flex flex-col overflow-hidden rounded-[18px] border border-border bg-card no-underline shadow-[var(--shadow-card)] transition-[transform,box-shadow] duration-150 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div
        className="relative h-[184px]"
        style={{ background: blogGradient(post.hue) }}
      >
        <span className="absolute left-3.5 top-3.5 rounded-full bg-card px-3 py-[5px] text-xs font-bold text-foreground">
          {post.categoryName}
        </span>
      </div>
      <div className="flex flex-1 flex-col px-[22px] pb-[22px] pt-5">
        <h3 className="mb-[9px] font-display text-[18px] font-bold leading-[1.3] tracking-[-0.01em] text-foreground">
          {post.title}
        </h3>
        <p className="mb-[18px] text-sm leading-[1.55] text-muted-foreground">
          {post.excerpt}
        </p>
        <div className="mt-auto flex items-center gap-2.5 border-t border-border pt-3.5">
          <span
            className="inline-flex size-[30px] items-center justify-center rounded-full font-display text-[12.5px] font-bold text-primary"
            style={{
              background:
                "color-mix(in oklab, var(--color-primary) 14%, var(--color-card))",
            }}
          >
            {authorInitial(post.author)}
          </span>
          <span className="text-[12.5px] text-muted-foreground">
            {post.date} · {post.read}
          </span>
        </div>
      </div>
    </Link>
  );
}
