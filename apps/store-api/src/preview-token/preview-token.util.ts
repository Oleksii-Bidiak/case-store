import { hmacSha256, safeEqual } from '../common/security';

/**
 * Signed preview links (TASK-668, plan 186, owner's decision B-9 №6–8) — the pure
 * half: no I/O, no clock, no config.
 *
 * TOKEN = `base64url(JSON{sc, exp, v}) + "." + base64url(HMAC-SHA256(key, body))`
 *
 *   - `sc`  — scope: `home`, `product:<id>`, `page:<id>` or `post:<id>`. A token opens
 *             a draft of exactly that one thing.
 *   - `exp` — expiry, unix SECONDS (24 h after issue).
 *   - `v`   — the generation it was issued under (`SeoSettings.previewTokenVersion`);
 *             «Відкликати всі прев'ю» bumps the generation and every older token dies.
 *
 * THE SECRET STAYS IN THE API (plan 186, constraint 2). The key is derived from
 * `JWT_SECRET` under a domain label, so no new env var exists and the storefront —
 * a public bundle built from `NEXT_PUBLIC_*` — never holds anything that could sign
 * or verify. It forwards the token; the API decides.
 *
 * Why a domain label rather than `JWT_SECRET` itself: an HMAC under the raw JWT key
 * would be a second use of the key that signs access tokens, and a value accepted by
 * one verifier must never be meaningful to the other.
 */

/** How long a preview link lives (decision B-9 №8). */
export const PREVIEW_TOKEN_TTL_SECONDS = 24 * 60 * 60;

/** Bump to invalidate every token ever issued, independent of the DB generation. */
export const PREVIEW_TOKEN_KEY_LABEL = 'preview-token:v1';

/** What a preview token can open. */
export type PreviewScopeType = 'home' | 'product' | 'page' | 'post';

export interface PreviewScope {
  type: PreviewScopeType;
  /** The entity id — absent for `home`. */
  id?: string;
}

export interface PreviewTokenPayload {
  sc: string;
  exp: number;
  v: number;
}

/** The signing key for preview tokens, derived from the JWT secret. */
export function derivePreviewKey(jwtSecret: string): Buffer {
  return Buffer.from(hmacSha256(jwtSecret, PREVIEW_TOKEN_KEY_LABEL, 'hex'), 'hex');
}

export function formatScope(scope: PreviewScope): string {
  return scope.type === 'home' ? 'home' : `${scope.type}:${scope.id ?? ''}`;
}

/** Parse a scope string; anything unknown or malformed is null. */
export function parseScope(sc: unknown): PreviewScope | null {
  if (typeof sc !== 'string') return null;
  if (sc === 'home') return { type: 'home' };
  const match = /^(product|page|post):([0-9a-fA-F-]{1,64})$/.exec(sc);
  if (!match) return null;
  return { type: match[1] as PreviewScopeType, id: match[2] };
}

export function signPreviewToken(payload: PreviewTokenPayload, key: Buffer): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${hmacSha256(key, body, 'base64url')}`;
}

/**
 * Verify signature, shape and expiry. Returns the payload, or null for ANYTHING
 * wrong — a forged, truncated, tampered or expired token all look the same to the
 * caller, which ignores them. The generation (`v`) is checked by the caller, which
 * owns the database read.
 */
export function verifyPreviewToken(
  token: unknown,
  key: Buffer,
  nowSeconds: number,
): PreviewTokenPayload | null {
  if (typeof token !== 'string' || token.length === 0 || token.length > 1024) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;
  if (!safeEqual(signature, hmacSha256(key, body, 'base64url'))) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) return null;
  const { sc, exp, v } = payload as Record<string, unknown>;
  if (typeof sc !== 'string' || !parseScope(sc)) return null;
  if (typeof exp !== 'number' || !Number.isFinite(exp) || exp <= nowSeconds) return null;
  if (typeof v !== 'number' || !Number.isInteger(v)) return null;
  return { sc, exp, v };
}
