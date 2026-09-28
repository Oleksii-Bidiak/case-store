import type { Page, Request } from "@playwright/test";
import { test, expect } from "./fixtures/test";

/**
 * No request to a bare `/catalog` (TASK-836, SF-UX-13).
 *
 * The storefront has never served `/catalog` without segments, yet the demo's
 * production console logged `GET /catalog?_rsc=… 404` and
 * `/catalog?sale=true&_rsc=… 404` on every home-page load: banner CTAs written
 * by the first seed pointed there, and `next/link` prefetches each banner
 * href. The rows are fixed by the `banner_cta_catalog_paths` migration; this
 * spec guards the storefront side:
 *   - nothing on the home page or the catalogue links to, or requests, a bare
 *     `/catalog` (the `/catalog/<category>/<device>` landing is a real route
 *     and stays allowed);
 *   - a stale link that still arrives is answered with a redirect, not a 404.
 *
 * `next dev` does not prefetch, so the DOM half — the hrefs a production build
 * WOULD prefetch — is what makes the check meaningful under this harness; the
 * network half catches any request the page makes on its own.
 */

/** `/catalog`, `/catalog/` or `/catalog?…` — never `/catalog/<segment>…`. */
function isBareCatalog(url: URL): boolean {
  return url.pathname === "/catalog" || url.pathname === "/catalog/";
}

function recordBareCatalogRequests(page: Page): string[] {
  const hits: string[] = [];
  page.on("request", (request: Request) => {
    const url = new URL(request.url());
    if (isBareCatalog(url)) hits.push(url.pathname + url.search);
  });
  return hits;
}

async function bareCatalogLinks(page: Page): Promise<string[]> {
  return page
    .locator('a[href="/catalog"], a[href="/catalog/"], a[href^="/catalog?"]')
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? ""),
    );
}

test.describe("no bare /catalog links or requests (TASK-836)", () => {
  for (const path of ["/", "/products"]) {
    test(`${path} neither links to nor requests a bare /catalog`, async ({
      page,
    }) => {
      const hits = recordBareCatalogRequests(page);

      await page.goto(path);
      await page.waitForLoadState("networkidle");
      // Below-the-fold banners and carousels mount on scroll.
      await page.mouse.wheel(0, 20_000);
      await page.waitForLoadState("networkidle");

      expect(await bareCatalogLinks(page)).toEqual([]);
      expect(hits).toEqual([]);
    });
  }

  test("a stale /catalog link is redirected, not a 404", async ({ page }) => {
    const bare = await page.goto("/catalog");
    expect(bare?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/products$/);

    const sale = await page.goto("/catalog?sale=true");
    expect(sale?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/promo$/);
  });
});
