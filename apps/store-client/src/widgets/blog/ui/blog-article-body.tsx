import { dict } from "@/shared/config";
import { RICH_TEXT_PROSE } from "@/shared/ui";
import { authorInitial, type BlogPostView } from "../model/posts";

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
      <div
        className={RICH_TEXT_PROSE}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {/* Author bio */}
      <div className="mt-7 flex items-start gap-4 rounded-2xl border border-border bg-card p-[22px] shadow-card">
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
