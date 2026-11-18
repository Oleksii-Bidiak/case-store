/** Longest original file name the library keeps, in characters (code points). */
export const MAX_ORIGINAL_FILENAME_LENGTH = 255;

/** C0 controls, DEL and C1 controls — nothing an operator meant to type. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

/**
 * The client's file name, reduced to a label the card can show and search can
 * match (TASK-1731). Null means "unknown", never "empty name".
 *
 * It is NEVER used as a path — storage names every file with a fresh UUID — so
 * this is about what an operator sees, not about traversal: the directory part
 * some browsers still send (`C:\fakepath\…`, a full Windows path from old
 * Edge) is dropped, control characters that would break the card's line are
 * removed, and the length is capped by CODE POINTS so a cut never leaves half
 * of a surrogate pair.
 *
 * Encoding is settled before this runs: multer is told the header is UTF-8
 * (`defParamCharset` in `imageMulterOptions`), so a Cyrillic name arrives
 * intact and nothing here guesses at latin1.
 */
export function normaliseOriginalFilename(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  const basename = raw.slice(Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\')) + 1);
  const cleaned = basename.replace(CONTROL_CHARS, '').trim();
  if (!cleaned) {
    return null;
  }
  return Array.from(cleaned).slice(0, MAX_ORIGINAL_FILENAME_LENGTH).join('').trim() || null;
}
