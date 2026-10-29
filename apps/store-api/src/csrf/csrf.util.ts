import { randomBytes } from 'crypto';
import { hmacSha256, safeEqual, timingSafeEqualHex } from '../common/security';

// Re-exported: callers (CsrfService, the LiqPay signature check) import it from here.
export { safeEqual };

/**
 * Signed double-submit CSRF token utilities.
 *
 * A token has the shape `<value>.<signature>` where:
 * - `value` is 32 random bytes (hex) — unguessable, unique per issue.
 * - `signature` is HMAC-SHA256(secret, value) (hex) — proves the token was
 *   issued by this server. An attacker who can write a cookie on a sibling
 *   subdomain still cannot forge a valid signature without the secret.
 *
 * The token is delivered in both a non-HttpOnly cookie and (by the frontend)
 * an `x-csrf-token` header. The middleware requires the two to match AND the
 * signature to verify — the signed double-submit cookie pattern recommended by
 * the OWASP CSRF Prevention Cheat Sheet for stateless (JWT) APIs.
 */

const TOKEN_VALUE_BYTES = 32;

/** Create a fresh signed CSRF token using the given secret. */
export function createCsrfToken(secret: string): string {
  const value = randomBytes(TOKEN_VALUE_BYTES).toString('hex');
  const signature = sign(value, secret);
  return `${value}.${signature}`;
}

/**
 * Verify that a token was issued by this server (its signature matches the
 * value under `secret`). Returns false for malformed tokens.
 */
export function isValidCsrfToken(token: string, secret: string): boolean {
  if (typeof token !== 'string') {
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return false;
  }

  const [value, signature] = parts;
  if (!value || !signature) {
    return false;
  }

  return timingSafeEqualHex(signature, sign(value, secret));
}

function sign(value: string, secret: string): string {
  return hmacSha256(secret, value, 'hex');
}
