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
  // Tables (TASK-434) — the third hand-kept copy of these rules; the others are
  // `TABLE_PROSE` in `../rich-text-editor/rich-text-editor.tsx` and the
  // storefront's `RICH_TEXT_PROSE`. `table-fixed` + `w-full` is what keeps a
  // wide table from pushing the page sideways on a narrow screen: a scroll
  // container would need a wrapper element, and the server's allow-list has no
  // tag to put one in.
  "[&_table]:my-4 [&_table]:w-full [&_table]:table-fixed [&_table]:border-collapse",
  "[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2",
  "[&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground [&_th]:break-words",
  "[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2",
  "[&_td]:align-top [&_td]:text-foreground [&_td]:break-words",
  // Tiptap wraps every cell's content in a paragraph; the 18px paragraph
  // spacing above would make each cell twice as tall as its text.
  "[&_th_p]:my-0 [&_td_p]:my-0",
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
 * Sanitization decision (plan 137, RE-ARGUED FROM SCRATCH for TASK-434): the
 * HTML is rendered via `dangerouslySetInnerHTML` with NO client-side sanitizer
 * and no new sanitizer dependency.
 *
 * The original argument was "the schema has no Image, Link or raw-HTML
 * extension". Half of that was already untrue when it was written — StarterKit
 * v3 bundles Link, so the schema has carried an `href`-bearing mark all along —
 * and TASK-434 added TableKit and H1/H4 on top. An argument that was only ever
 * true by accident must not be inherited, so here is the one that holds:
 *
 * 1. The two attribute-bearing types are each constrained AT THE SCHEMA, not by
 *    being absent.
 *    - Link runs `isAllowedUri` on parse, on render, on `setLink`/`toggleLink`,
 *      on autolink and on paste. `RichTextEditor` narrows it to the server's
 *      own scheme list (http/https/mailto, plus same-site relative paths), so
 *      `javascript:` and `data:` URIs never become a link mark in the first
 *      place: the text stays text. A mark that cannot hold a dangerous href
 *      cannot serialize one.
 *    - Table cells hold `colspan`/`rowspan`/`colwidth` (numbers) and `align`
 *      (one of three literals, rendered into a fixed `text-align: …` template).
 *      None of them is free-form, and none of them is a URL or a handler.
 * 2. Editor output is schema-constrained by construction. `getHTML()` is
 *    ProseMirror's schema-driven serializer: it emits registered node/mark
 *    types and their declared attributes, nothing else. Pasted HTML is
 *    re-parsed through the same schema, so `<script>`, `<iframe>`, `style=`
 *    and every `on*` handler are dropped before they could reach this string.
 * 3. What this component actually receives is the FORM FIELD, not the editor's
 *    output — and on an edit form that field is seeded from the stored entity
 *    and can be previewed before the admin types anything. It can also hold
 *    markup the schema cannot represent: that is precisely why TASK-467 added
 *    the truncation latch to `RichTextEditor`, and the value this preview
 *    renders is the ORIGINAL string, not the latched one. So the invariant is
 *    NOT "this came from the current editor session" — it is the narrower but
 *    true one: every string that reaches this component either came from the
 *    editor above it or passed `sanitizeRichText()` on the way into the
 *    database. Both write paths of pages, blog posts and products go through
 *    it, and so does the catalogue import.
 * 4. The real barrier is therefore on the server: `sanitizeRichText()` runs on
 *    every write path, and the storefront renders only what came back through
 *    it. This preview is a rendering of already-gated content, not a trust
 *    boundary of its own.
 *
 * REVISIT if any of the four stops being true — in particular if a raw-HTML,
 * markdown-paste or `Image`-with-src extension is added (none of those is
 * constrained the same way), if `isAllowedUri` is loosened, or if a NEW write
 * path stores rich text without `sanitizeRichText()`. The cheap insurance, if
 * that day comes, is a DOMPurify pass here — `isomorphic-dompurify` is already
 * a dependency of the storefront, which does exactly that on /legal and /info.
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
