import { test, expect, type Page } from "./fixtures/test";
import {
  E2E_CATEGORY_SLUG,
  E2E_PRODUCT_SLUG,
  E2E_SOLD_OUT_PRODUCT_SLUG,
} from "./fixtures/seed-e2e";

/**
 * The catalogue's first HTML links to products (TASK-563, SF-SEO-25).
 *
 * The catalogue widgets are client components; until TASK-563 the server sent a
 * skeleton and a crawler that does not run JavaScript found no product link on
 * `/products`, `/categories/*`, a PDP, the homepage or `/promo`. The routes now
 * prefetch their data on the server and hand it to the widgets through a
 * `PrefetchBoundary`.
 *
 * Two halves per route:
 *  1. the raw HTML (`request.get`, no browser, no JavaScript) carries the links;
 *  2. the browser then hydrates that HTML without a mismatch — a server/client
 *     query-key disagreement would render a skeleton over the server's cards and
 *     React would log «Hydration failed».
 */
function collectHydrationErrors(page: Page): string[] {
  const errors: string[] = [];
  // The verbose messages of a dev build, plus the minified codes a production
  // build logs for the same failures (418/423/425 — hydration mismatches).
  const isHydration = (text: string) =>
    /hydrat|did not match|server rendered HTML|react\.dev\/errors\/(418|423|425)/i.test(
      text,
    );
  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") return;
    if (isHydration(message.text())) errors.push(message.text());
  });
  page.on("pageerror", (error) => {
    if (isHydration(error.message)) errors.push(error.message);
  });
  return errors;
}

const PRODUCT_LINK = /href="\/products\/[a-z0-9-]+"/;

test.describe("catalogue SSR", () => {
  for (const route of [
    "/products",
    `/categories/${E2E_CATEGORY_SLUG}`,
    // The PDP links on through its «Схожі товари» rail — the sold-out fixture
    // shares the category.
    `/products/${E2E_PRODUCT_SLUG}`,
    "/",
  ]) {
    test(`${route} — the raw HTML already links to products`, async ({
      request,
    }) => {
      const response = await request.get(route);
      expect(response.status()).toBe(200);
      expect(await response.text()).toMatch(PRODUCT_LINK);
    });
  }

  test("/products — the server's cards name the seeded products", async ({
    request,
  }) => {
    const html = await (await request.get("/products")).text();
    expect(html).toContain(`href="/products/${E2E_PRODUCT_SLUG}"`);
    expect(html).toContain(`href="/products/${E2E_SOLD_OUT_PRODUCT_SLUG}"`);
    expect(html).toContain('"@type":"ItemList"');
  });

  for (const route of [
    "/products",
    `/categories/${E2E_CATEGORY_SLUG}`,
    `/products/${E2E_PRODUCT_SLUG}`,
    "/categories",
    "/promo",
    "/",
  ]) {
    test(`${route} — hydrates the server HTML without a mismatch`, async ({
      page,
    }) => {
      const errors = collectHydrationErrors(page);

      await page.goto(route);
      await page.waitForLoadState("networkidle");

      expect(errors).toEqual([]);
    });
  }
});
