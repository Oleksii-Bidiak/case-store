/**
 * TASK-433 — `STOREFRONT_HOST` is the green breadcrumb host of the SERP-snippet
 * preview. It must come from the environment (the storefront origin the
 * deployment actually uses), never from a hardcoded domain, and it must not be
 * able to take the admin panel down: the module is imported by `shared/config`,
 * which loads on every page, so a malformed env value has to degrade rather
 * than throw.
 *
 * Each case re-imports the module with `jest.resetModules()` because the value
 * is computed once at import time.
 */
async function loadHost(siteUrl?: string, appUrl?: string): Promise<string> {
  jest.resetModules();
  const prevSite = process.env.NEXT_PUBLIC_SITE_URL;
  const prevApp = process.env.NEXT_PUBLIC_APP_URL;
  try {
    if (siteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = siteUrl;
    if (appUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = appUrl;

    const mod = await import("./site");
    return mod.STOREFRONT_HOST;
  } finally {
    if (prevSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = prevSite;
    if (prevApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prevApp;
  }
}

describe("STOREFRONT_HOST (TASK-433)", () => {
  it("is the host of NEXT_PUBLIC_SITE_URL — scheme and path stripped", async () => {
    await expect(loadHost("https://shop.example.ua/")).resolves.toBe(
      "shop.example.ua",
    );
  });

  it("keeps a non-default port, which is part of the host", async () => {
    await expect(loadHost("http://192.168.0.10:8080")).resolves.toBe(
      "192.168.0.10:8080",
    );
  });

  it("falls back to NEXT_PUBLIC_APP_URL, mirroring STOREFRONT_URL's chain", async () => {
    await expect(loadHost(undefined, "https://app.example.ua")).resolves.toBe(
      "app.example.ua",
    );
  });

  it("falls back to localhost when neither variable is set", async () => {
    await expect(loadHost(undefined, undefined)).resolves.toBe(
      "localhost:3000",
    );
  });

  // The whole reason the parsing lives here and not in `dictionary.ts`: an
  // unparseable value must yield a dull fallback, not an exception thrown while
  // a constants module is being imported.
  it("degrades to the fallback instead of throwing on a malformed URL", async () => {
    await expect(loadHost("not a url")).resolves.toBe("localhost:3000");
  });

  it("never returns the domain that used to be hardcoded", async () => {
    await expect(loadHost(undefined, undefined)).resolves.not.toBe(
      "mobilestore.ua",
    );
  });
});
