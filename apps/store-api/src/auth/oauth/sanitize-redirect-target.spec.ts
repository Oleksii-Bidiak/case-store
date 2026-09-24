import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

  it('keeps a same-origin path with query and hash intact', () => {
    expect(sanitizeRedirectTarget('/products?page=2#top')).toBe('/products?page=2#top');
  });

  /**
   * TASK-770. The WHATWG URL parser drops TAB/LF/CR before parsing, so a
   * leading-`//` check on the raw string can be dodged by hiding one of them
   * between the slashes: `?redirect=/%09/evil.com` decodes to `/\t/evil.com`,
   * and `new URL('/\t/evil.com', origin)` is `https://evil.com/`.
   */
  it.each([
    ['decoded %09 (TAB) between the slashes', '/\t/evil.com'],
    ['decoded %0a (LF) between the slashes', '/\n/evil.com'],
    ['decoded %0d (CR) between the slashes', '/\r/evil.com'],
    ['a run of mixed TAB/LF/CR', '/\t\r\n/evil.com'],
    ['TAB before the backslash spelling', '/\t\\evil.com'],
    ['a leading TAB before //', '\t//evil.com'],
  ])('rejects %s', (_label, raw) => {
    expect(sanitizeRedirectTarget(raw)).toBe('/');
  });

  it('decodes %09 the way a query string would and still rejects it', () => {
    const raw = new URLSearchParams('redirect=/%09/evil.com').get('redirect');
    expect(raw).toBe('/\t/evil.com');
    expect(sanitizeRedirectTarget(raw)).toBe('/');
  });

  it('never returns a value the URL parser resolves off-origin', () => {
    const origin = 'https://shop.example';
    for (const raw of ['/\t/evil.com', '/\n/evil.com', '/\r/evil.com', '/\t\\evil.com']) {
      // Sanity: the raw input really is an open redirect without the fix.
      expect(new URL(raw, origin).origin).not.toBe(origin);
      expect(new URL(sanitizeRedirectTarget(raw), origin).origin).toBe(origin);
    }
  });

  it('strips CR/LF/TAB from an otherwise legit path (header-injection guard)', () => {
    // The returned value can no longer split a `Location` header.
    expect(sanitizeRedirectTarget('/checkout\r\nSet-Cookie: x=1')).toBe('/checkoutSet-Cookie: x=1');
    expect(sanitizeRedirectTarget('/checkout\npath')).toBe('/checkoutpath');
    expect(sanitizeRedirectTarget('/check\tout')).toBe('/checkout');
  });

  it('falls back to / when nothing but parser-dropped characters remains', () => {
    expect(sanitizeRedirectTarget('\t\r\n')).toBe('/');
    expect(sanitizeRedirectTarget(null)).toBe('/');
  });
});

/**
 * TASK-527 / TASK-770: the storefront and admin carry copies of this function
 * (no shared package). Their bodies are compared here as text — comment lines,
 * quote style, whitespace and braces normalized away — so a hotfix to one copy
 * cannot silently reopen the redirect in the others.
 */
describe('sanitizeRedirectTarget — parity with the storefront and admin copies', () => {
  const apps = resolve(__dirname, '../../../..');
  const body = (relative: string): string => {
    const source = readFileSync(resolve(apps, relative), 'utf8');
    return source
      .slice(source.indexOf('export function sanitizeRedirectTarget'))
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/'/g, '"')
      .replace(/[\s{}]/g, '');
  };
  const api = body('store-api/src/auth/oauth/sanitize-redirect-target.ts');

  it('matches the storefront copy', () => {
    expect(body('store-client/src/features/auth/lib/sanitize-redirect-target.ts')).toBe(api);
  });

  it('matches the admin copy', () => {
    expect(body('store-admin/src/features/admin-auth/lib/sanitize-redirect-target.ts')).toBe(api);
  });
});
