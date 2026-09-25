/**
 * Max accepted length of a rich-text body (`Page.content`, `BlogPost.content`),
 * in characters, markup included (TASK-571).
 *
 * Measured, not guessed: the largest body the seed ships is the public offer at
 * 3 906 characters, and a real Ukrainian public-offer agreement runs to a few
 * tens of thousands once it is marked up. 100 000 leaves that an order of
 * magnitude of room while still refusing what the limit is actually for — a
 * body that is mostly a base64 image blob pasted inline.
 *
 * The product description has its own, smaller limit
 * (`MAX_DESCRIPTION_LENGTH` in product.constants.ts); this one is for the two
 * long-form bodies. Shared by the create and update DTOs of both so the four can
 * never drift.
 */
export const MAX_RICH_TEXT_CONTENT_LENGTH = 100_000;

/**
 * Explicit JSON request-body limit for the whole API, in bytes (TASK-571).
 *
 * It has to be derived from {@link MAX_RICH_TEXT_CONTENT_LENGTH}, not picked on
 * its own: a character is up to 3 bytes of UTF-8 (Cyrillic is 2) and every `"`
 * in the markup is escaped to 2 bytes, so a body at the DTO limit is at most
 * ~4 bytes per character on the wire, plus the other fields of the request.
 * Express's implicit default (100 kB) sat BELOW that — a legal page of ~50 000
 * Cyrillic characters would have been refused by the parser with a bare 413
 * before validation could say why — while nothing at all bounded the body
 * explicitly. `rich-text.constants.spec.ts` pins the relation.
 */
export const JSON_BODY_LIMIT_BYTES = 512 * 1024;

/**
 * The documented range of a table span in rich text (TASK-548): a `colspan`
 * (and a `<col>`/`<colgroup>` `span`) is kept within 1…MAX_TABLE_COLSPAN, a
 * `rowspan` within 1…MAX_TABLE_ROWSPAN. A larger value is clamped to the bound;
 * zero, a negative or a non-number is dropped, which is the browser's own
 * default of 1.
 *
 * Why a bound at all: a span is structure, so the sanitizer has to let it
 * through, but HTML itself only caps it at 1000 columns / 65534 rows —
 * `colspan="9999"` in a `table-fixed` table lays out a thousand phantom columns
 * and squeezes every real one to nothing. Why these two numbers: rich-text
 * bodies render at most 760 px wide, where 20 columns are already ~38 px each —
 * past that nothing is readable anyway; and a spec table grouping rows (one
 * "Сумісність" header over every model in a line) can reasonably run to a few
 * dozen rows, never to hundreds. The storefront's second-pass sanitizer
 * (`shared/lib/sanitize-html.ts`) clamps to the same numbers.
 */
export const MAX_TABLE_COLSPAN = 20;
export const MAX_TABLE_ROWSPAN = 100;
