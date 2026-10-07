import { createHmac, timingSafeEqual } from 'crypto';

/**
 * HMAC-SHA256 and constant-time comparison, shared by every signed token the API
 * issues (TASK-668): the CSRF double-submit token (`csrf/csrf.util.ts`) and the signed
 * preview links (`preview-token/`). One implementation, so the two cannot drift into
 * one of them comparing signatures with `===`.
 */

/** HMAC-SHA256 of `value` under `secret`, in the requested encoding. */
export function hmacSha256(
  secret: string | Buffer,
  value: string,
  encoding: 'hex' | 'base64url' = 'hex',
): string {
  return createHmac('sha256', secret).update(value).digest(encoding);
}

/** Constant-time string comparison. Returns false on any length mismatch or non-string. */
export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** timingSafeEqual on two hex strings, guarding against length mismatch. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
