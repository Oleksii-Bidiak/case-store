import { dict } from "@/shared/config";

/**
 * Prose typography ported from the storefront's blog article body
 * (`apps/store-client/src/widgets/blog/ui/blog-article-body.tsx`, PROSE
 * constant — read-only visual reference, not imported: FSD forbids cross-app
 * imports). Self-contained Tailwind arbitrary variants; no global stylesheet
 * edits. The tag set matches what the shared server-side `sanitizeRichText()`
 * allows for both Page.content and BlogPost.content, so one component serves
 * both forms.
 */
const PROSE = [
  "min-w-0 max-w-[760px]",
  "[&_h2]:mt-[38px] [&_h2]:mb-3.5 [&_h2]:scroll-mt-[90px] [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-[-0.01em] [&_h2]:text-foreground",
  "[&_h3]:mt-7 [&_h3]:mb-2.5 [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-foreground",
  "[&_>:first-child]:mt-0",
  "[&_p]:mb-[18px] [&_p]:text-[17px] [&_p]:leading-[1.75] [&_p]:text-foreground",
  "[&_ul]:mb-[22px] [&_ul]:list-disc [&_ul]:pl-[22px] [&_ul]:text-[17px] [&_ul]:leading-[1.7] [&_ul]:text-foreground",
  "[&_ol]:mb-[22px] [&_ol]:list-decimal [&_ol]:pl-[22px] [&_ol]:text-[17px] [&_ol]:leading-[1.7] [&_ol]:text-foreground",
  "[&_li]:mb-2",
  "[&_a]:text-primary [&_a]:underline",
  "[&_blockquote]:mb-[22px] [&_blockquote]:rounded-r-xl [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:py-4 [&_blockquote]:pr-[22px] [&_blockquote]:pl-[22px] [&_blockquote]:text-[17px] [&_blockquote]:leading-[1.65] [&_blockquote]:text-foreground [&_blockquote]:italic",
].join(" ");

export interface RichTextPreviewProps {
  html: string;
  /** Shown instead of the prose block when `html` has no text content. */
  emptyLabel?: string;
}

/**
 * RichTextPreview (plan 137, TASK-266) — renders the admin's live Tiptap HTML
 * through the storefront's prose typography, so page/blog authors see real
 * headings/lists/quotes before publishing.
 *
 * Sanitization decision (deliberate, not an oversight — plan 137): the HTML is
 * rendered via `dangerouslySetInnerHTML` with NO client-side sanitizer and no
 * new sanitizer dependency, because:
 *
 * 1. The input is schema-constrained by construction. `RichTextEditor` builds
 *    its Tiptap instance from `StarterKit.configure({ heading: { levels: [2,
 *    3] } })` only — no Image/Link/raw-HTML extension. Tiptap's `getHTML()` is
 *    ProseMirror's schema-driven serializer: it can only emit the registered
 *    node/mark types with no arbitrary attributes. There is no schema path
 *    that produces a <script> tag, an on* handler, or a javascript: URL —
 *    pasted HTML is re-parsed through the same schema, silently dropping
 *    anything it doesn't recognize.
 * 2. This preview renders the CURRENT admin's own in-memory, unsaved draft in
 *    their own tab — never a foreign/stored string, and never to a second
 *    user. The real security boundary is unchanged: the API's
 *    `sanitizeRichText()` still sanitizes on persist, and the storefront still
 *    sanitizes what it renders to visitors.
 * 3. Adding `isomorphic-dompurify`/`sanitize-html` to store-admin would be a
 *    new dependency for a redundant guarantee.
 *
 * REVISIT this decision if `RichTextEditor`'s extension set ever grows to
 * include Image, Link, or a raw-HTML/markdown paste extension — those are not
 * schema-constrained the same safe way.
 */
export function RichTextPreview({ html, emptyLabel }: RichTextPreviewProps) {
  // Text-based emptiness: Tiptap emits "<p></p>" for a cleared document, which
  // must show the placeholder too, not an invisible empty paragraph.
  const isEmpty = !html.replace(/<[^>]*>/g, "").trim();

  return (
    <div
      data-testid="rich-text-preview"
      className="rounded-md border border-border bg-card px-4 py-5"
    >
      {isEmpty ? (
        <p className="text-sm text-muted-foreground italic">
          {emptyLabel ?? dict.contentPreview.emptyContent}
        </p>
      ) : (
        <div className={PROSE} dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  );
}
