/**
 * The documented range of a table span in rich text (TASK-548), the same
 * numbers as `MAX_TABLE_COLSPAN` / `MAX_TABLE_ROWSPAN` in the API's
 * `common/sanitize/rich-text.constants.ts` — the API clamps on every write,
 * and the storefront clamps again on render so a body stored before that
 * clamp existed cannot lay out ten thousand phantom columns either. The two
 * apps cannot share a module; change one, change both.
 */
export const MAX_TABLE_COLSPAN = 20;
export const MAX_TABLE_ROWSPAN = 100;

/** Upper bound per span attribute; a `<col>`/`<colgroup>` `span` counts columns. */
const SPAN_LIMITS: Readonly<Record<string, number>> = {
  colspan: MAX_TABLE_COLSPAN,
  rowspan: MAX_TABLE_ROWSPAN,
  span: MAX_TABLE_COLSPAN,
};

/** The span attributes {@link clampTableSpan} knows. */
export const TABLE_SPAN_ATTRIBUTES = Object.keys(SPAN_LIMITS);

/**
 * HTML's "rules for parsing non-negative integers" — how a browser reads a
 * span: leading ASCII whitespace and one `+` skipped, then digits, trailing
 * junk ignored.
 */
const HTML_NON_NEGATIVE_INTEGER = /^[\t\n\f\r ]*\+?(\d+)/;

/**
 * The value a span attribute should carry after clamping: the parsed number
 * capped at its bound, as plain digits — or `null` when the attribute should
 * be removed (zero, negative or unparseable; the browser default of 1 then
 * applies). `rowspan="0"` means "to the end of the section", an unbounded span
 * by another name, so it is removed too. Unknown attribute names come back
 * unchanged.
 */
export function clampTableSpan(name: string, value: string): string | null {
  const max = SPAN_LIMITS[name];
  if (max === undefined) {
    return value;
  }
  const digits = HTML_NON_NEGATIVE_INTEGER.exec(value)?.[1];
  const parsed = digits === undefined ? 0 : Number(digits);
  return parsed < 1 ? null : String(Math.min(parsed, max));
}
