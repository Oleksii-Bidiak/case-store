import Link from "next/link";
import { FallbackImg } from "@/shared/ui";
import { authorInitial, blogGradient, type BlogPostView } from "../model/posts";

/**
 * BlogPostCard — a single article card in the responsive grid. Presentational;
 * links to the article page. The cover is the post's `coverImageUrl`, over a
 * token-derived gradient that shows when there is none (or it fails to load).
 */
export function BlogPostCard({ post }: { post: BlogPostView }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="flex flex-col overflow-hidden rounded-card border border-border bg-card no-underline shadow-card transition-[transform,box-shadow] duration-150 hover:-translate-y-1 hover:shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div
        className="relative h-[184px]"
        style={{ background: blogGradient(post.hue) }}
      >
        {/* TASK-873 — the post's own cover when it has one; the gradient
            stays behind it as the no-cover look and the failed-load fallback. */}
        <FallbackImg
          src={post.coverImageUrl}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
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
          <span className="inline-flex size-[30px] items-center justify-center rounded-full font-display text-xs font-bold text-primary bg-primary/14">
            {authorInitial(post.author)}
          </span>
          <span className="text-xs text-muted-foreground">
            {post.date} · {post.read}
          </span>
        </div>
      </div>
    </Link>
  );
}
