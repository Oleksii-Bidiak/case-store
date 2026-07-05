import { dict } from "@/shared/config";
import { authorInitial, type BlogPostView } from "../model/posts";

// Child-element styling for the sanitized article HTML, mirroring the original
// mockup's typographic scale (the body is now real per-post content from the
// Blog backend rather than a shared static block — TASK-173).
const PROSE = [
  "min-w-0 max-w-[760px]",
  "[&_h2]:mt-[38px] [&_h2]:mb-3.5 [&_h2]:scroll-mt-[90px] [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-[-0.01em] [&_h2]:text-foreground",
  "[&_h3]:mt-7 [&_h3]:mb-2.5 [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-foreground",
  "[&_p]:mb-[18px] [&_p]:text-[17px] [&_p]:leading-[1.75] [&_p]:text-foreground",
  "[&_ul]:mb-[22px] [&_ul]:list-disc [&_ul]:pl-[22px] [&_ul]:text-[17px] [&_ul]:leading-[1.7] [&_ul]:text-foreground",
  "[&_ol]:mb-[22px] [&_ol]:list-decimal [&_ol]:pl-[22px] [&_ol]:text-[17px] [&_ol]:leading-[1.7] [&_ol]:text-foreground",
  "[&_li]:mb-2",
  "[&_a]:text-primary [&_a]:underline",
  "[&_blockquote]:mb-[22px] [&_blockquote]:rounded-r-xl [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:py-4 [&_blockquote]:pr-[22px] [&_blockquote]:pl-[22px] [&_blockquote]:text-[17px] [&_blockquote]:leading-[1.65] [&_blockquote]:text-foreground [&_blockquote]:italic",
].join(" ");

/**
 * BlogArticleBody — renders the sanitized per-post HTML body (`html`, with TOC
 * anchors already injected by `buildArticleToc`) plus the author bio card. The
 * HTML is server-sanitized by the API, so `dangerouslySetInnerHTML` is safe here.
 */
export function BlogArticleBody({
  post,
  html,
}: {
  post: BlogPostView;
  html: string;
}) {
  return (
    <article className="mx-auto min-w-0 max-w-[760px]">
      <div className={PROSE} dangerouslySetInnerHTML={{ __html: html }} />

      {/* Author bio */}
      <div className="mt-7 flex items-start gap-4 rounded-2xl border border-border bg-card p-[22px] shadow-[var(--shadow-card)]">
        <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-primary font-display text-xl font-bold text-primary-foreground">
          {authorInitial(post.author)}
        </span>
        <div>
          <b className="block font-display text-base text-foreground">
            {post.author}
          </b>
          <span className="my-0.5 mb-2 block text-[13px] font-semibold text-primary">
            {dict.blog.article.authorRolePlaceholder}
          </span>
          <p className="text-sm leading-[1.6] text-muted-foreground">
            {dict.blog.article.authorBioPlaceholder}
          </p>
        </div>
      </div>
    </article>
  );
}
