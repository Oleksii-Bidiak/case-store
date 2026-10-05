// TASK-873 — unfilled owner placeholders never reach a shopper.
//
// The seed and the outage fallbacks write every company fact the code cannot
// know (cities served, a pickup address, years on the market, a support
// schedule…) as an explicit `[bracketed placeholder]` for the owner to fill in
// (TASK-311: no invented facts). Until the owner does, /info showed the brackets
// verbatim — «Курʼєр по місту — [вартість]». The rule here is «hide the line»:
// the sentence holding a placeholder is dropped, a list item or paragraph left
// empty goes with it, and a list emptied that way takes its heading along. What
// the owner HAS written stays exactly as written.

/**
 * `[…]` with at least one letter inside — `[вартість]`, `[N]`, `[email]`. A
 * bracketed number (`[1]`, a footnote) or a bracket spanning markup is not one.
 * Spelled as explicit ranges (Latin + Cyrillic) because the client targets
 * ES2017, which has no `\p{L}`.
 */
const PLACEHOLDER = /\[[^[\]<>]*[A-Za-zЀ-ӿ][^[\]<>]*\]/;

/** True when the text still holds an unfilled `[placeholder]`. */
export function hasUnfilledPlaceholder(text: string): boolean {
  return PLACEHOLDER.test(text);
}

/**
 * Split on sentence ends (`.`, `!`, `?`, `…` followed by whitespace), keeping
 * each terminator with its sentence. No lookbehind — ES2017 again.
 */
function splitSentences(text: string): string[] {
  const parts = text.split(/([.!?…]+)(\s+)/);
  const sentences: string[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    const body = parts[i] ?? "";
    const end = parts[i + 1] ?? "";
    if (body || end) sentences.push(body + end);
  }
  return sentences;
}

/**
 * Plain text (an FAQ answer, a page excerpt) without the sentences that hold a
 * placeholder. Returns `""` when nothing is left — the caller hides the item.
 *
 * A placeholder in the FIRST sentence empties the whole text: that sentence
 * names what the rest is about («**Самовивіз** — [адреса]. Безкоштовно.»), so
 * keeping the tail would leave «Безкоштовно.» describing nothing.
 */
export function stripUnfilledSentences(text: string): string {
  if (!hasUnfilledPlaceholder(text)) return text;
  const sentences = splitSentences(text);
  if (hasUnfilledPlaceholder(sentences[0] ?? "")) return "";
  return sentences
    .filter((sentence) => !hasUnfilledPlaceholder(sentence))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** An innermost text block: its content opens no other block element. */
const INNER_BLOCK =
  /<(p|li|h[1-6]|dt|dd|td|th|figcaption|blockquote)\b([^>]*)>((?:(?!<(?:p|li|ul|ol|h[1-6]|dl|table|blockquote)\b)[\s\S])*?)<\/\1>/gi;

/** A list item or paragraph with nothing but whitespace left in it. */
const EMPTY_BLOCK = /<(li|p)\b[^>]*>\s*<\/\1>/gi;

/**
 * An emptied list, together with the heading directly above it, if any. The
 * heading's content may not cross another heading tag — otherwise the lazy match
 * would start at an EARLIER heading and swallow everything in between.
 */
const EMPTY_LIST =
  /(?:<(h[1-6])\b[^>]*>(?:(?!<\/?h[1-6]\b)[\s\S])*?<\/\1>\s*)?<(ul|ol)\b[^>]*>\s*<\/\2>/gi;

/**
 * Page HTML (an /info section body) with every unfilled placeholder's sentence
 * removed, then the blocks and lists that left empty. Run it on the RAW body
 * and sanitize afterwards: the sentence split works on markup as text, and the
 * sanitizer is what guarantees well-formed, safe output whatever it produced.
 */
export function stripUnfilledBlocks(html: string): string {
  if (!hasUnfilledPlaceholder(html)) return html;
  let out = html.replace(
    INNER_BLOCK,
    (block, tag: string, attrs: string, inner: string) =>
      hasUnfilledPlaceholder(inner)
        ? `<${tag}${attrs}>${stripUnfilledSentences(inner)}</${tag}>`
        : block,
  );
  // Removing an empty <p> can empty the <li> around it — repeat until stable.
  for (let previous = ""; previous !== out;) {
    previous = out;
    out = out.replace(EMPTY_BLOCK, "").replace(EMPTY_LIST, "");
  }
  return out;
}
