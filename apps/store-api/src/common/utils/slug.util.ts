import { transliterate } from './transliterate.util';

/**
 * Generate a URL-friendly slug from a name string.
 *
 * Transliterates Cyrillic to Latin, converts to lowercase, replaces spaces and
 * underscores with hyphens, removes special characters, and collapses multiple
 * hyphens.
 *
 * Used by ProductService and CategoryService for auto-generating slugs
 * when not provided by the client.
 *
 * The transliteration step (TASK-360) is not cosmetic: the special-character
 * strip below is `[^\w\s-]`, and `\w` is ASCII-only, so a Ukrainian name used to
 * slugify to the EMPTY STRING. Every auto-slugged Ukrainian entity would have
 * collided on "" against the UNIQUE constraint. Latin input is unaffected —
 * `transliterate` passes it through untouched.
 */
export function generateSlug(name: string): string {
  return transliterate(name)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}
