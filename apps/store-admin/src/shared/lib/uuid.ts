/**
 * An id's SHAPE — 8-4-4-4-12 hex, any case — and nothing more (TASK-397,
 * TASK-808).
 *
 * Every id an admin form validates is one the database issued: the category,
 * brand, group or device brand the form just read and posts back. The legacy
 * seed wrote ids whose version/variant nibbles are not those of any UUID
 * version, so a version-aware check rejects the form's own data. This is the
 * client twin of the API's `@IsUUID('loose')`. Use it via `.regex(UUID_PATTERN,
 * …)` / `.refine(…)` — never zod's built-in uuid check, which is strict RFC on
 * zod 4 (`uuid.test.ts` fails on a new one).
 */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
