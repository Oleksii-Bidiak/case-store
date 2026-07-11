/**
 * Sanitize a post-OAuth redirect target (TASK-168).
 *
 * Server-side mirror of the same-origin check `login-form.tsx` does
 * client-side, hardened because this value survives a round trip through
 * Google (inside the signed OAuth `state`) and is echoed back into an HTTP
 * redirect `Location` header — an open-redirect / header-injection surface
 * if validated loosely.
 *
 * Accepts only a same-origin relative path: must start with a single `/`,
 * never `//` (protocol-relative) or `/\` (browsers normalize the backslash
 * variant to protocol-relative too), and must contain no CR/LF
 * (header-injection guard). Anything else — or absent — falls back to `/`.
 */
export function sanitizeRedirectTarget(raw: string | undefined): string {
  if (!raw) {
    return '/';
  }
  if (!raw.startsWith('/')) {
    return '/';
  }
  if (raw.startsWith('//') || raw.startsWith('/\\')) {
    return '/';
  }
  if (raw.includes('\r') || raw.includes('\n')) {
    return '/';
  }
  return raw;
}
