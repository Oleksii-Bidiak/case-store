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

  it("rejects CR/LF, which the API echoes into a Location header", () => {
    expect(sanitizeRedirectTarget("/checkout\r\nSet-Cookie: a=b")).toBe("/");
  });

  it("falls back to the homepage when there is no target", () => {
    expect(sanitizeRedirectTarget(null)).toBe("/");
    expect(sanitizeRedirectTarget(undefined)).toBe("/");
    expect(sanitizeRedirectTarget("")).toBe("/");
  });
});
