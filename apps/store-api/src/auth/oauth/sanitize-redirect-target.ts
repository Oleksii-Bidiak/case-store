/**
 * Sanitize a post-OAuth redirect target (TASK-168, TASK-770).
 *
 * Server-side mirror of the same-origin check `login-form.tsx` does
 * client-side, hardened because this value survives a round trip through
 * Google (inside the signed OAuth `state`) and is echoed back into an HTTP
 * redirect `Location` header — an open-redirect / header-injection surface
 * if validated loosely.
 *
 * Step 1 strips every TAB, LF and CR. That is exactly the set the WHATWG URL
 * parser silently drops, so checking the raw string is checking something
 * the browser never sees: `/\t/evil.com` does not start with `//`, yet
 * `new URL('/\t/evil.com', origin)` resolves to `https://evil.com/`
 * (TASK-770). Stripping also neutralizes CR/LF header injection — the value
 * we return can no longer split a `Location` header.
 *
 * Step 2 applies the path rules to the stripped value: it must start with a
 * single `/`, never `//` (protocol-relative) or `/\` (browsers normalize the
 * backslash variant to protocol-relative too). Anything else — or absent —
 * falls back to `/`. The stripped value is what gets returned, so the check
 * and the redirect always see the same string.
 */
export function sanitizeRedirectTarget(raw: string | null | undefined): string {
  if (!raw) {
    return '/';
  }
  const target = raw.replace(/[\t\n\r]/g, '');
  if (!target.startsWith('/')) {
    return '/';
  }
  if (target.startsWith('//') || target.startsWith('/\\')) {
    return '/';
  }
  return target;
}
