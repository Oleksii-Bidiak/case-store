import { createHash } from 'crypto';

/**
 * Derive a stable, RFC 4122 version-4 id from a seed string (sha1-based). Lets the
 * seed upsert ProductGroup rows idempotently even though groups have no natural
 * unique key (TASK-142).
 *
 * TASK-397: the first cut only reshaped the sha1 digest into the 8-4-4-4-12 form
 * and left the version nibble (index 12) and the variant nibble (index 16) to
 * chance. Roughly fifteen of every sixteen seeded groups therefore carried an id
 * that is UUID-shaped but not a valid UUID of any version — even validator's
 * permissive `all` pattern wants the version nibble in `[1-8]` and the variant in
 * `[89ab]`. Those ids went into the database, came back out through the admin
 * product form, and were rejected by `@IsUUID` on the way in again: every grouped
 * product answered 400 on save. Forcing both nibbles keeps the function
 * deterministic (the same seed still yields the same id) and makes the output a
 * real v4.
 */
export function deterministicUuid(seed: string): string {
  const h = createHash('sha1').update(seed).digest('hex').split('');
  h[12] = '4'; // version 4
  h[16] = '89ab'[parseInt(h[16], 16) % 4]; // variant 10xx — one of 8, 9, a, b
  const hex = h.join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Deterministic string hash — keeps seeded review counts and ratings stable
 * across runs so the seed is idempotent and reproducible.
 */
export function hashStr(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
