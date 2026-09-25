import { JSON_BODY_LIMIT_BYTES, MAX_RICH_TEXT_CONTENT_LENGTH } from './rich-text.constants';

describe('rich-text limits (TASK-571)', () => {
  /** Worst realistic wire size of one character of rich text: 3-byte UTF-8, or an escaped quote. */
  const WORST_BYTES_PER_CHAR = 4;
  /** Room for every other field of a page / blog-post request (title, meta, keywords…). */
  const OTHER_FIELDS_BYTES = 64 * 1024;

  it('lets a body at the DTO limit through the JSON parser, so validation (not a bare 413) answers', () => {
    expect(JSON_BODY_LIMIT_BYTES).toBeGreaterThanOrEqual(
      MAX_RICH_TEXT_CONTENT_LENGTH * WORST_BYTES_PER_CHAR + OTHER_FIELDS_BYTES,
    );
  });

  it('still bounds the body — no more than twice what the DTO limit can need', () => {
    expect(JSON_BODY_LIMIT_BYTES).toBeLessThanOrEqual(
      2 * (MAX_RICH_TEXT_CONTENT_LENGTH * WORST_BYTES_PER_CHAR + OTHER_FIELDS_BYTES),
    );
  });

  it('is far above the largest seeded body (the public offer, 3 906 characters)', () => {
    expect(MAX_RICH_TEXT_CONTENT_LENGTH).toBeGreaterThan(10 * 3906);
  });
});
