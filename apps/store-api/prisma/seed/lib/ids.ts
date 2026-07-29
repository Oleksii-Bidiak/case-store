import { createHash } from 'crypto';

/**
 * Derive a stable, UUID-shaped id from a seed string (sha1-based). Lets the seed
 * upsert ProductGroup rows idempotently even though groups have no natural
 * unique key (TASK-142).
 */
export function deterministicUuid(seed: string): string {
  const h = createHash('sha1').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
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
