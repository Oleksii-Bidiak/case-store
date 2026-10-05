/**
 * The article body's own numbers (BlogProposal БЛ7, TASK-1154 / TASK-1177).
 *
 * `length` is measured on the HTML, not on the visible text, because that is
 * what the API limits: `content` is `@MaxLength(MAX_RICH_TEXT_CONTENT_LENGTH)`
 * on the Tiptap output (store-api `common/sanitize`), 100 000 characters.
 *
 * `minutes` is an ESTIMATE the form offers next to the «Час читання» field —
 * the API stores what the operator enters and derives nothing (TASK-1177), so
 * the estimate is never written behind their back.
 */

/** Mirrors store-api `MAX_RICH_TEXT_CONTENT_LENGTH`. */
export const BLOG_CONTENT_MAX_LENGTH = 100_000;

/** A comfortable reading pace for Ukrainian prose. */
export const WORDS_PER_MINUTE = 200;

export interface BlogContentStats {
  words: number;
  images: number;
  minutes: number;
  length: number;
}

const TAG = /<[^>]*>/g;
const ENTITY = /&[a-z0-9#]+;/gi;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const IMAGE = /<img\b/gi;

export function blogContentStats(html: string): BlogContentStats {
  const text = html.replace(TAG, " ").replace(ENTITY, " ");
  const words = text
    .split(/\s+/)
    .filter((token) => HAS_LETTER_OR_DIGIT.test(token)).length;
  const images = html.match(IMAGE)?.length ?? 0;
  return {
    words,
    images,
    minutes: words === 0 ? 0 : Math.ceil(words / WORDS_PER_MINUTE),
    length: html.length,
  };
}
