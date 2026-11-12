import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { test, expect } from "./fixtures/test";
import { waitForHydration } from "./fixtures/hydration";
// Importing the seed module also loads the API's env file, so DATABASE_URL is
// the same database the webServer-booted API reads.
import { E2E_CATEGORY_SLUG, E2E_PRODUCT_SLUG } from "./fixtures/seed-e2e";

/**
 * A filter click keeps the page where it is (TASK-2414).
 *
 * Before, `router.replace` without `{ scroll: false }` scrolled every filter
 * change to the top of the page: a brand ticked deep in the desktop rail
 * flung the shopper back up to the toolbar. Now the position stays, and if
 * the new results moved the clicked section out of view, it is brought back
 * to that section's start — never to the top.
 *
 * Fixture: one manufacturer brand on `test-product`, so the rail's «Виробник»
 * section lists it on the e2e category's landing page. Restored afterwards.
 */
const BRAND_SLUG = "e2e-scroll-brand";
const BRAND_NAME = "E2E Scroll Brand";
const CATEGORY_PATH = `/categories/${E2E_CATEGORY_SLUG}`;

function db() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return { pool, prisma: new PrismaClient({ adapter: new PrismaPg(pool) }) };
}

test.beforeAll(async () => {
  const { pool, prisma } = db();
  try {
    const brand = await prisma.brand.upsert({
      where: { slug: BRAND_SLUG },
      update: { isActive: true },
      create: { name: BRAND_NAME, slug: BRAND_SLUG },
    });
    await prisma.product.update({
      where: { slug: E2E_PRODUCT_SLUG },
      data: { brandId: brand.id },
    });
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
});

test.afterAll(async () => {
  const { pool, prisma } = db();
  try {
    await prisma.product.update({
      where: { slug: E2E_PRODUCT_SLUG },
      data: { brandId: null },
    });
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
});

// A short desktop window: the rail (tree, «Мої пристрої», the filters) runs
// past the fold, so the brand section is reached by scrolling the page.
test.use({ viewport: { width: 1280, height: 480 } });

test("a brand ticked down the rail does not throw the page to the top", async ({
  page,
}) => {
  await page.goto(CATEGORY_PATH);

  const section = page.locator('aside [data-filter-section="brand"]');
  const brand = section.getByRole("checkbox", { name: BRAND_NAME });
  // The input itself is `sr-only` — a shopper clicks its label.
  const brandLabel = section.locator("label").filter({ hasText: BRAND_NAME });
  await expect(brandLabel).toBeVisible({ timeout: 30_000 });
  await waitForHydration(brand);

  // Scroll down the rail until the brand section sits at the top.
  await section.evaluate((node) => {
    const top = node.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top - 120, behavior: "instant" });
  });
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);

  // Every frame from the click on: the lowest scroll position painted, so a
  // jump to the top that something later scrolls back is still caught.
  await page.evaluate(() => {
    const w = window as unknown as { __minScrollY: number };
    w.__minScrollY = window.scrollY;
    const sample = () => {
      w.__minScrollY = Math.min(w.__minScrollY, window.scrollY);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  await brandLabel.click();

  await expect(page).toHaveURL(new RegExp(`[?&]brand=${BRAND_SLUG}`));
  // No `#anchor` either — that was the old workaround for the jump.
  expect(new URL(page.url()).hash).toBe("");
  await expect(brand).toBeChecked();

  // Let the new results land and any correcting scroll settle.
  await page.waitForTimeout(800);
  const minScrollY = await page.evaluate(
    () => (window as unknown as { __minScrollY: number }).__minScrollY,
  );
  // Without `scroll: false` this was 0 (measured): Next scrolled to the top
  // first, and only the section check brought the brand back.
  expect(minScrollY).toBeGreaterThan(0);
  await expect(section).toBeInViewport();
});
