import Link from "next/link";
import { blogGradient, type BlogPostView } from "../model/posts";

/**
 * BlogRelatedCard — a compact "Читайте також" card (cover + category badge +
 * title + date · read, no excerpt). Presentational; links to the article.
 */
export function BlogRelatedCard({ post }: { post: BlogPostView }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="flex flex-col overflow-hidden rounded-[18px] border border-border bg-card no-underline shadow-card transition-[transform,box-shadow] duration-150 hover:-translate-y-1 hover:shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div
        className="relative h-[172px]"
        style={{ background: blogGradient(post.hue) }}
      >
        <span className="absolute left-3.5 top-3.5 rounded-full bg-card px-3 py-[5px] text-xs font-bold text-foreground">
          {post.categoryName}
        </span>
      </div>
      <div className="flex flex-1 flex-col px-5 pt-[18px] pb-5">
        <h3 className="mb-2 font-display text-[16.5px] font-bold leading-[1.3] tracking-[-0.01em] text-foreground">
          {post.title}
        </h3>
        <span className="mt-auto text-[12.5px] text-muted-foreground">
          {post.date} · {post.read}
        </span>
      </div>
    </Link>
  );
}
