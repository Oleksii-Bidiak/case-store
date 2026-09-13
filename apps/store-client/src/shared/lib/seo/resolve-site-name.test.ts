import { SITE_NAME } from "@/shared/config";
import { resolveSiteName } from "./resolve-site-name";

/**
 * TASK-433 — the store's name has ONE source (`SeoSettings.siteName`) and ONE
 * fallback (the `SITE_NAME` constant). Every server-rendered surface that prints
 * the name goes through this function, so the three ways the admin value can be
 * missing are all asserted here rather than at each of the ten call sites.
 */
describe("resolveSiteName (TASK-433)", () => {
  it("returns the admin-managed name when one is set", () => {
    expect(resolveSiteName({ siteName: "Аксесуарня" })).toBe("Аксесуарня");
  });

  it("trims surrounding whitespace off the admin value", () => {
    expect(resolveSiteName({ siteName: "  Аксесуарня \n" })).toBe("Аксесуарня");
  });

  it("falls back to the constant when the column is null (fresh install)", () => {
    expect(resolveSiteName({ siteName: null })).toBe(SITE_NAME);
  });

  it("falls back to the constant when the field is absent", () => {
    expect(resolveSiteName({})).toBe(SITE_NAME);
  });

  it("falls back to the constant when the settings fetch failed", () => {
    expect(resolveSiteName(null)).toBe(SITE_NAME);
    expect(resolveSiteName(undefined)).toBe(SITE_NAME);
  });

  // An owner who empties the box wants the default back — NOT a nameless
  // `og:site_name` and a `<title>` ending in a bare separator.
  it("treats a blank or whitespace-only value as unset", () => {
    expect(resolveSiteName({ siteName: "" })).toBe(SITE_NAME);
    expect(resolveSiteName({ siteName: "   " })).toBe(SITE_NAME);
  });
});
