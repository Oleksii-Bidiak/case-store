import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sanitizeRedirectTarget } from "./sanitize-redirect-target";

/**
 * The cases that matter are the ones a leading-slash check waves through.
 * Kept in step with the API's own `sanitize-redirect-target.spec.ts` — the two
 * guards protect the same value on two sides of the same round trip.
 */
describe("sanitizeRedirectTarget", () => {
  it("keeps a plain same-origin path, query and hash included", () => {
    expect(sanitizeRedirectTarget("/checkout")).toBe("/checkout");
    expect(sanitizeRedirectTarget("/products?page=2#top")).toBe(
      "/products?page=2#top",
    );
  });

  it.each([
    ["protocol-relative", "//evil.com"],
    ["protocol-relative with a path", "//evil.com/login"],
    ["the backslash spelling browsers normalize to //", "/\\evil.com"],
  ])("rejects %s", (_label, raw) => {
    expect(sanitizeRedirectTarget(raw)).toBe("/");
  });

  it("rejects anything that is not a path at all", () => {
    expect(sanitizeRedirectTarget("https://evil.com")).toBe("/");
    expect(sanitizeRedirectTarget("javascript:alert(1)")).toBe("/");
    expect(sanitizeRedirectTarget("checkout")).toBe("/");
  });

  /**
   * TASK-770. The WHATWG URL parser drops TAB/LF/CR before parsing, so a
   * leading-`//` check on the raw string can be dodged by hiding one of them
   * between the slashes: `?redirect=/%09/evil.com` decodes to `/\t/evil.com`,
   * and `new URL("/\t/evil.com", origin)` is `https://evil.com/`.
   */
  it.each([
    ["decoded %09 (TAB) between the slashes", "/\t/evil.com"],
    ["decoded %0a (LF) between the slashes", "/\n/evil.com"],
    ["decoded %0d (CR) between the slashes", "/\r/evil.com"],
    ["a run of mixed TAB/LF/CR", "/\t\r\n/evil.com"],
    ["TAB before the backslash spelling", "/\t\\evil.com"],
    ["a leading TAB before //", "\t//evil.com"],
  ])("rejects %s", (_label, raw) => {
    expect(sanitizeRedirectTarget(raw)).toBe("/");
  });

  it("decodes %09 the way searchParams would and still rejects it", () => {
    const raw = new URLSearchParams("redirect=/%09/evil.com").get("redirect");
    expect(raw).toBe("/\t/evil.com");
    expect(sanitizeRedirectTarget(raw)).toBe("/");
  });

  it("never returns a value the URL parser resolves off-origin", () => {
    const origin = "https://shop.example";
    for (const raw of [
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r/evil.com",
      "/\t\\evil.com",
    ]) {
      // Sanity: the raw input really is an open redirect without the fix.
      expect(new URL(raw, origin).origin).not.toBe(origin);
      expect(new URL(sanitizeRedirectTarget(raw), origin).origin).toBe(origin);
    }
  });

  it("strips CR/LF, which the API echoes into a Location header", () => {
    expect(sanitizeRedirectTarget("/checkout\r\nSet-Cookie: a=b")).toBe(
      "/checkoutSet-Cookie: a=b",
    );
    expect(sanitizeRedirectTarget("/check\tout")).toBe("/checkout");
  });

  it("falls back to the homepage when there is no target", () => {
    expect(sanitizeRedirectTarget(null)).toBe("/");
    expect(sanitizeRedirectTarget(undefined)).toBe("/");
    expect(sanitizeRedirectTarget("")).toBe("/");
    expect(sanitizeRedirectTarget("\t\r\n")).toBe("/");
  });
});

/**
 * TASK-527 / TASK-770: the storefront, admin and API copies share no package,
 * so "change one, change all three" is only a comment unless something reads
 * them. This compares the function bodies as text — comment lines, quote style,
 * whitespace and braces normalized away, since the API is formatted differently.
 */
describe("sanitizeRedirectTarget — parity with the admin and API copies", () => {
  const apps = resolve(__dirname, "../../../../..");
  const body = (relative: string): string => {
    const source = readFileSync(resolve(apps, relative), "utf8");
    return source
      .slice(source.indexOf("export function sanitizeRedirectTarget"))
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/'/g, '"')
      .replace(/[\s{}]/g, "");
  };
  const storefront = body(
    "store-client/src/features/auth/lib/sanitize-redirect-target.ts",
  );

  it("matches the admin copy", () => {
    expect(
      body(
        "store-admin/src/features/admin-auth/lib/sanitize-redirect-target.ts",
      ),
    ).toBe(storefront);
  });

  it("matches the API copy", () => {
    expect(body("store-api/src/auth/oauth/sanitize-redirect-target.ts")).toBe(
      storefront,
    );
  });
});
