import { sanitizeRedirectTarget } from './sanitize-redirect-target';

/**
 * TASK-168 (plan 153 §TDD cases 1-7).
 *
 * The redirect target survives a round trip through Google (inside the signed
 * OAuth `state`) and is echoed back into an HTTP redirect `Location` header —
 * an open-redirect / header-injection surface if not strictly validated.
 * Only same-origin relative paths are ever accepted; everything else falls
 * back to `/`.
 */
describe('sanitizeRedirectTarget', () => {
  it('passes a valid relative path through unchanged', () => {
    expect(sanitizeRedirectTarget('/checkout')).toBe('/checkout');
  });

  it('defaults to / when the value is absent', () => {
    expect(sanitizeRedirectTarget(undefined)).toBe('/');
  });

  it('defaults to / for an empty string', () => {
    expect(sanitizeRedirectTarget('')).toBe('/');
  });

  it('rejects an absolute URL', () => {
    expect(sanitizeRedirectTarget('https://evil.com')).toBe('/');
  });

  it('rejects a protocol-relative URL (//)', () => {
    expect(sanitizeRedirectTarget('//evil.com')).toBe('/');
  });

  it('rejects the backslash protocol-relative variant (/\\)', () => {
    // Browsers normalize `/\evil.com` to `//evil.com` — same open redirect.
    expect(sanitizeRedirectTarget('/\\evil.com')).toBe('/');
  });

  it('rejects paths containing CR/LF (header-injection guard)', () => {
    expect(sanitizeRedirectTarget('/checkout\r\nSet-Cookie: x=1')).toBe('/');
    expect(sanitizeRedirectTarget('/checkout\npath')).toBe('/');
    expect(sanitizeRedirectTarget('/checkout\rpath')).toBe('/');
  });
});
