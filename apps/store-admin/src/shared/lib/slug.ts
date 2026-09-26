import { transliterate } from "./transliterate";

/**
 * The shape of a hand-typed slug: lowercase ASCII letters and digits in groups
 * joined by single hyphens — no leading/trailing hyphen, no `--`.
 *
 * The ONE admin copy (TASK-811). Eight form schemas used to declare it locally,
 * which is how a rule tends to drift: the next change lands in the form someone
 * happened to be looking at. It mirrors the `@Matches` on the API's slug DTO
 * fields; what {@link slugify} produces always matches it (or is empty).
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Generate a URL-friendly slug from a name string.
 *
 * Cyrillic is transliterated first (TASK-360) — the special-character strip is
 * ASCII-only, so a Ukrainian name used to slugify to the empty string.
 *
 * Direct port of the backend's `generateSlug`
 * (`apps/store-api/src/common/utils/slug.util.ts`) so the admin's live preview
 * matches exactly what the server derives when `slug` is omitted from the
 * create/update DTO. Pure function (no side effects, no browser API) — safe to
 * barrel-export from `shared/lib`.
 */
export function slugify(name: string): string {
  return transliterate(name)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // strip special characters
    .replace(/[\s_]+/g, "-") // spaces and underscores → hyphen
    .replace(/-+/g, "-") // collapse multiple hyphens
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}
