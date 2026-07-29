import { transliterate } from "./transliterate";

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
