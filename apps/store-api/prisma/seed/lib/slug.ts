export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * A slug that is safe in a URL and in every downstream consumer: lowercase
 * latin alphanumerics joined by single hyphens. `slugify()` strips everything
 * outside `[a-z0-9]`, so a purely Cyrillic name collapses to the empty string —
 * these guards turn that silent data loss into a failed seed (plan 170).
 */
const LATIN_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Throw unless `slug` is a latin kebab-case token. Returns it for chaining. */
export function assertLatinSlug(slug: string, context: string): string {
  if (!slug || !LATIN_SLUG_RE.test(slug)) {
    throw new Error(`Seed: invalid slug "${slug}" for ${context} — must match ${LATIN_SLUG_RE}`);
  }
  return slug;
}

/** Throw if `slugs` holds duplicates, listing every one of them at once. */
export function assertUniqueSlugs(slugs: string[], context: string): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const slug of slugs) {
    if (seen.has(slug)) duplicates.add(slug);
    seen.add(slug);
  }
  if (duplicates.size > 0) {
    throw new Error(`Seed: duplicate slugs for ${context} — ${[...duplicates].sort().join(', ')}`);
  }
}
