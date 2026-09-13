import { cn } from "@/shared/lib/utils";

/**
 * Child-element styling for sanitized rich-text HTML, mirroring the original
 * mockup's typographic scale. Extracted from `BlogArticleBody` (TASK-361) so the
 * blog article body and the PDP description tab share one definition instead of
 * drifting apart — the admin's `RichTextPreview` already keeps a hand-copied
 * mirror of this list, and a third copy was one too many.
 *
 * The tag set matches what the API's `sanitizeRichText()` allow-list permits.
 */
export const RICH_TEXT_PROSE = [
  "min-w-0 max-w-[760px]",
  "[&_h2]:mt-[38px] [&_h2]:mb-3.5 [&_h2]:scroll-mt-[90px] [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-[-0.01em] [&_h2]:text-foreground",
  "[&_h3]:mt-7 [&_h3]:mb-2.5 [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-foreground",
  "[&_p]:mb-[18px] [&_p]:text-[17px] [&_p]:leading-[1.75] [&_p]:text-foreground",
  "[&_ul]:mb-[22px] [&_ul]:list-disc [&_ul]:pl-[22px] [&_ul]:text-[17px] [&_ul]:leading-[1.7] [&_ul]:text-foreground",
  "[&_ol]:mb-[22px] [&_ol]:list-decimal [&_ol]:pl-[22px] [&_ol]:text-[17px] [&_ol]:leading-[1.7] [&_ol]:text-foreground",
  "[&_li]:mb-2",
  "[&_a]:text-primary [&_a]:underline",
  "[&_blockquote]:mb-[22px] [&_blockquote]:rounded-r-xl [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:py-4 [&_blockquote]:pr-[22px] [&_blockquote]:pl-[22px] [&_blockquote]:text-[17px] [&_blockquote]:leading-[1.65] [&_blockquote]:text-foreground [&_blockquote]:italic",
  // Tables (TASK-434). Until the admin editor could build one, a table in a
  // description rendered as unstyled browser default — borderless rows of
  // run-together text. These rules are mirrored in the admin panel twice
  // (`TABLE_PROSE` in its rich-text-editor, and `PROSE` in its
  // rich-text-preview); change one, change all three.
  //
  // `table-fixed` + `w-full` is load-bearing, not cosmetic: it is what stops a
  // wide spec table from making the whole page scroll sideways on a phone —
  // column widths stop following content, so cells wrap. Giving the table its
  // own horizontal scroll container would need a wrapper element around it,
  // and the API's `sanitizeRichText()` allow-list has no tag to put one in.
  "[&_table]:mb-[22px] [&_table]:w-full [&_table]:table-fixed [&_table]:border-collapse [&_table]:text-[15px]",
  "[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2",
  "[&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground [&_th]:break-words",
  "[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2",
  "[&_td]:align-top [&_td]:text-foreground [&_td]:break-words",
  // Tiptap wraps every cell's content in a paragraph; the 18px paragraph
  // spacing above would make each cell twice as tall as its text.
  "[&_th_p]:my-0 [&_td_p]:my-0",
].join(" ");

/**
 * Styling for the legacy plain-text branch — the exact scale the PDP
 * description tab used before it became rich text, so an untouched old
 * description renders pixel-for-pixel as it did. Kept as a joined array for the
 * same reason as {@link RICH_TEXT_PROSE}: these are design-import values, not
 * ad-hoc ones.
 */
const PLAIN_TEXT_BLOCK = [
  "max-w-[760px]",
  "whitespace-pre-line",
  "text-[15px] leading-[1.7] text-foreground",
].join(" ");

/**
 * Does this stored string carry HTML markup, or is it legacy plain text?
 *
 * Product descriptions were a plain textarea until TASK-361 and are rich text
 * after it, so BOTH shapes live in the database at once and no migration can
 * tell them apart reliably (a plain-text description is valid HTML — it just
 * renders as one unbroken paragraph, silently eating every line break the
 * author typed). Detecting the shape at render time costs one regex and is
 * lossless in both directions.
 *
 * Deliberately narrow: it looks for a tag that the sanitizer's allow-list can
 * actually produce, so a description that merely mentions "5 < 10 > 3" is not
 * mistaken for markup.
 */
export function looksLikeHtml(value: string): boolean {
  return /<(?:p|br|h[1-4]|ul|ol|li|strong|b|em|i|u|s|a|img|blockquote|code|pre|table|hr)\b[^>]*>/i.test(
    value,
  );
}

/**
 * RichText — renders API-sanitized rich text.
 *
 * The HTML is sanitized server-side on every write path (`sanitizeRichText()`),
 * which is why `dangerouslySetInnerHTML` is correct here rather than merely
 * convenient. Legacy plain-text values fall back to a `whitespace-pre-line`
 * block so their line breaks survive.
 */
export function RichText({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  if (!looksLikeHtml(content)) {
    return <div className={cn(PLAIN_TEXT_BLOCK, className)}>{content}</div>;
  }

  return (
    <div
      className={cn(RICH_TEXT_PROSE, className)}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
