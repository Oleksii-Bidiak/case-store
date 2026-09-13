/**
 * The comma-separated tag input shared by the product, category, page and blog
 * forms (TASK-437).
 *
 * One input, one parser: the API takes `keywords` as a `string[]`, but a chip
 * editor is a lot of UI for a field an operator touches twice a year, so the
 * form binds a plain text input and converts at the boundary. Splitting on BOTH
 * commas and newlines is deliberate — a list pasted from a spreadsheet column
 * arrives newline-separated, and rejecting it would look like a bug.
 *
 * The parser mirrors the server's `normalizeKeywords` (trim → drop blanks →
 * drop case-insensitive duplicates) so what the operator sees after a save is
 * what they typed; the limits mirror the API's `IsKeywordsField` for the same
 * reason the other forms mirror their DTO's `@MaxLength` — a form that lets
 * through what the backend refuses turns a typo into an unexplained 400.
 */

/** Mirror of the API's `KEYWORDS_MAX_COUNT`. */
export const KEYWORDS_MAX_COUNT = 20;

/** Mirror of the API's `KEYWORD_MAX_LENGTH`. */
export const KEYWORD_MAX_LENGTH = 60;

/** Split a raw input value into normalised tags (trimmed, de-duplicated). */
export function parseKeywords(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const tag = part.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

/** Render a stored tag list back into the input's text value. */
export function formatKeywords(
  keywords: readonly string[] | undefined | null,
): string {
  return (keywords ?? []).join(", ");
}
