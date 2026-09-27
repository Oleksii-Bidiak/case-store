import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { test, expect } from "./fixtures/test";
// Importing the seed module also loads the API's env file, so DATABASE_URL is
// the same database the webServer-booted API reads.
import { E2E_CATEGORY_SLUG, E2E_PRODUCT_SLUG } from "./fixtures/seed-e2e";

/**
 * A filtered compatibility landing page is `noindex, follow` (TASK-835,
 * SF-SEO-19 — the owner's run saw the canonical but no robots).
 *
 * Checked twice over, because Next 16 serves metadata two ways: to a crawler it
 * renders the tags into `<head>` before anything is sent; to a browser it
 * STREAMS them in after the shell, so they arrive later in the same response
 * and are hoisted into `<head>` on the client. «View source» in a browser is the
 * second path — so both are asserted on the raw HTML, and the browser one again
 * on the live DOM.
 *
 * The fixture pair is created here rather than in `seed-e2e.ts`: nothing else
 * needs a device model, and a compat page exists exactly while some active
 * product of the category is compatible with it — `test-product` is that
 * product.
 */
const DEVICE_BRAND_SLUG = "e2e-device-brand";
const DEVICE_MODEL_SLUG = "e2e-phone-15";
const COMPAT_PATH = `/catalog/${E2E_CATEGORY_SLUG}/${DEVICE_MODEL_SLUG}`;

const GOOGLEBOT_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/** Every `<meta name="robots">` content attribute in a raw HTML document. */
function robotsContents(html: string): string[] {
  return [...html.matchAll(/<meta name="robots" content="([^"]*)"/g)].map(
    (match) => match[1],
  );
}

/** Every canonical `<link>` href in a raw HTML document. */
function canonicalHrefs(html: string): string[] {
  return [...html.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map(
    (match) => match[1],
  );
}

test.beforeAll(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const brand = await prisma.deviceBrand.upsert({
      where: { slug: DEVICE_BRAND_SLUG },
      update: { isActive: true },
      create: { name: "E2E Devices", slug: DEVICE_BRAND_SLUG },
    });
    const model = await prisma.deviceModel.upsert({
      where: { slug: DEVICE_MODEL_SLUG },
      update: { isActive: true, deviceBrandId: brand.id },
      create: {
        name: "E2E Phone 15",
        slug: DEVICE_MODEL_SLUG,
        deviceBrandId: brand.id,
      },
    });
    const product = await prisma.product.findUniqueOrThrow({
      where: { slug: E2E_PRODUCT_SLUG },
    });
    await prisma.productDeviceCompat.upsert({
      where: {
        productId_deviceModelId: {
          productId: product.id,
          deviceModelId: model.id,
        },
      },
      update: {},
      create: { productId: product.id, deviceModelId: model.id },
    });
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
});

test.describe("compat landing robots (TASK-835)", () => {
  for (const [label, userAgent] of [
    ["a crawler", GOOGLEBOT_UA],
    ["a browser", BROWSER_UA],
  ] as const) {
    test(`a filtered page is noindex,follow for ${label}`, async ({
      request,
    }) => {
      const response = await request.get(`${COMPAT_PATH}?minPrice=100`, {
        headers: { "User-Agent": userAgent },
      });
      expect(response.status()).toBe(200);
      const html = await response.text();

      expect(robotsContents(html)).toContain("noindex, follow");
      // B-10 §5: the filtered view consolidates onto the CATEGORY.
      expect(canonicalHrefs(html)).toEqual([
        expect.stringMatching(new RegExp(`/categories/${E2E_CATEGORY_SLUG}$`)),
      ]);
    });
  }

  test("the unfiltered page is indexable and self-canonical", async ({
    request,
  }) => {
    const response = await request.get(COMPAT_PATH, {
      headers: { "User-Agent": GOOGLEBOT_UA },
    });
    expect(response.status()).toBe(200);
    const html = await response.text();

    expect(robotsContents(html).join(" ")).not.toContain("noindex");
    expect(canonicalHrefs(html)).toEqual([
      expect.stringMatching(new RegExp(`${COMPAT_PATH}$`)),
    ]);
  });

  test("the robots tag is in the live document <head>", async ({ page }) => {
    await page.goto(`${COMPAT_PATH}?inStock=true`);

    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, follow",
    );
  });

  test("ticking a filter in the sidebar swaps the head to noindex", async ({
    page,
  }) => {
    // The owner's own steps: open the clean page, tick a facet, read the head.
    // The facet is applied by a client-side navigation, so this is the path on
    // which a stale <head> would survive.
    // The guard removes a DOM node; React must never trip over that.
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(COMPAT_PATH);
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`${COMPAT_PATH}$`),
    );

    const main = page.getByRole("main");
    const inStockOnly = main.getByRole("checkbox", {
      name: "Тільки в наявності",
    });
    // `sr-only` input under a painted box — toggle it the keyboard way (same as
    // catalog-in-stock.spec.ts).
    await inStockOnly.focus();
    await page.keyboard.press("Space");
    await expect(page).toHaveURL(/[?&]inStock=true/);

    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, follow",
    );
    // This test ticks the facet as soon as the checkbox is interactive — on
    // `next dev` that is ~150–200 ms BEFORE React hydrates the head's metadata
    // tags. React then never owns the server-rendered self-canonical and never
    // removes it; without `StaleCanonicalGuard` the head kept BOTH canonicals
    // for good (the verifier's red run, 2026-09-26). The guard drops the orphan
    // once the new canonical has arrived — so poll for that settled state:
    // exactly one canonical, pointing at the category. A strict-mode locator
    // assertion would fail on the brief overlap instead of waiting it out.
    await expect
      .poll(() =>
        page
          .locator('head link[rel="canonical"]')
          .evaluateAll((links) =>
            links.map((link) => link.getAttribute("href")),
          ),
      )
      .toEqual([
        expect.stringMatching(new RegExp(`/categories/${E2E_CATEGORY_SLUG}$`)),
      ]);

    // Untick it: back to the indexable view — one self-canonical, no robots.
    await inStockOnly.focus();
    await page.keyboard.press("Space");
    await expect(page).not.toHaveURL(/[?&]inStock=true/);
    await expect
      .poll(() =>
        page
          .locator('head link[rel="canonical"]')
          .evaluateAll((links) =>
            links.map((link) => link.getAttribute("href")),
          ),
      )
      .toEqual([expect.stringMatching(new RegExp(`${COMPAT_PATH}$`))]);
    await expect(page.locator('head meta[name="robots"]')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
});
