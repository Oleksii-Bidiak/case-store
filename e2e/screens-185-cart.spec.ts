import * as fs from "node:fs";
import * as path from "node:path";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { test, expect, type Page } from "./fixtures/test";
import { waitForHydration } from "./fixtures/hydration";
import { E2E_CATEGORY_SLUG } from "./fixtures/seed-e2e";

// Same env source as the other fixtures: specs run from the repo root, where
// DATABASE_URL may be unset. An inline DATABASE_URL wins (dotenv never
// overrides), and that is how this harness is meant to be run.
loadEnv({ path: path.resolve(__dirname, "../apps/store-api/.env") });

/**
 * TASK-657 screenshot harness — «Прибрати недоступні» in the cart and the
 * cart sheet. Evidence for the visual verifier, not a regression gate.
 *
 * SKIPPED unless `SCREENS_185` is set. Writes
 * `docs/images/185/657/<name>-page-{1440,390}.png`, one pair per state, to be
 * read next to the `Cart.dc.html` mockup shots (`#unavailable`,
 * `#unavailable-1`, `#cleaned`, «ЦІЛЬ · TASK-657 — шторка кошика»).
 *
 *   E2E_API_PORT=3101 E2E_CLIENT_PORT=3100 E2E_ADMIN_PORT=3102 \
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/store_test_185 \
 *   SCREENS_185=1 npx playwright test e2e/screens-185-cart.spec.ts
 *
 * The committed set is webp (sharp, quality 80) — the PNGs this writes were
 * converted after the run, next to `<name>-mockup-{1440,390}` shots of the
 * mockup taken with a stdin-token Playwright script (see .design-sync/NOTES.md).
 *
 * Data: three products of its own (upserted by slug, re-activated at the start
 * of every test), added to a guest cart through the PDP — the cart routes are
 * CSRF-protected, so the UI is the honest way in — then withdrawn from sale by
 * flipping `isActive` in Prisma, which is exactly what an admin's «Деактивувати»
 * does to an existing cart line.
 */

const ENABLED = !!process.env.SCREENS_185;
const OUT_DIR = path.resolve(__dirname, "../docs/images/185/657");
const RENDER_TIMEOUT_MS = 30_000;

const VIEWPORTS = [
  ["1440", { width: 1440, height: 900 }],
  ["390", { width: 390, height: 844 }],
] as const;

/** Mirrors the mockup's three rows (names and prices), so the shots compare like for like. */
const PRODUCTS = {
  airpods: {
    slug: "s185-airpods-pro-2",
    name: "Навушники Apple AirPods Pro 2",
    price: "9999.00",
    compareAtPrice: null,
    sku: "S185-AIRPODS",
  },
  spigen: {
    slug: "s185-spigen-ultra-hybrid",
    name: "Чохол Spigen Ultra Hybrid для iPhone 15",
    price: "899.00",
    compareAtPrice: "1099.00",
    sku: "S185-SPIGEN",
  },
  anker: {
    slug: "s185-anker-usb-c-lightning",
    name: "Кабель Anker USB-C — Lightning з сертифікацією MFi",
    price: "599.00",
    compareAtPrice: null,
    sku: "S185-ANKER",
  },
} as const;
type ProductKey = keyof typeof PRODUCTS;

test.skip(!ENABLED, "set SCREENS_185=1 to capture TASK-657 shots");

function withPrisma<T>(fn: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return fn(prisma).finally(() => prisma.$disconnect());
}

async function seedProducts(): Promise<void> {
  await withPrisma(async (prisma) => {
    const category = await prisma.category.upsert({
      where: { slug: E2E_CATEGORY_SLUG },
      update: {},
      create: { name: "E2E Category", slug: E2E_CATEGORY_SLUG },
    });
    for (const p of Object.values(PRODUCTS)) {
      await prisma.product.upsert({
        where: { slug: p.slug },
        update: {
          name: p.name,
          price: p.price,
          compareAtPrice: p.compareAtPrice,
          isActive: true,
          deletedAt: null,
          stock: 100,
          categoryId: category.id,
        },
        create: {
          name: p.name,
          slug: p.slug,
          description: "TASK-657 screenshot fixture.",
          price: p.price,
          compareAtPrice: p.compareAtPrice,
          sku: p.sku,
          stock: 100,
          categoryId: category.id,
          isActive: true,
        },
      });
    }
  });
}

async function setActive(keys: ProductKey[], isActive: boolean): Promise<void> {
  await withPrisma((prisma) =>
    prisma.product.updateMany({
      where: { slug: { in: keys.map((k) => PRODUCTS[k].slug) } },
      data: { isActive },
    }),
  );
}

function note(message: string): void {
  console.log(`[screens-185-657] ${message}`);
}

async function shot(
  page: Page,
  name: string,
  fullPage: boolean,
): Promise<void> {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({
    path: file,
    fullPage,
    animations: "disabled",
    caret: "hide",
  });
  note(`${name}.png written`);
}

/** Add one product through its PDP and wait for the API to accept it. */
async function addToCart(page: Page, key: ProductKey): Promise<void> {
  await page.goto(`/products/${PRODUCTS[key].slug}`);
  const button = page
    .getByRole("main")
    .getByRole("button", { name: /додати до кошика/i });
  await expect(button).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
  await waitForHydration(button);
  const added = page.waitForResponse(
    (r) =>
      r.url().includes("/api/cart/items") &&
      r.request().method() === "POST" &&
      r.ok(),
    { timeout: RENDER_TIMEOUT_MS },
  );
  await button.click();
  await added;
}

async function openCart(page: Page): Promise<void> {
  await page.goto("/cart");
  await expect(
    page.getByRole("heading", { name: "Разом" }).first(),
  ).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {
    // An analytics beacon may keep the network busy; the shot is still valid.
  });
}

const removeButton = (page: Page, scope: "main" | "dialog") =>
  (scope === "main"
    ? page.getByRole("main")
    : page.getByRole("dialog")
  ).getByRole("button", { name: /^Прибрати \d+ недоступн/ });

async function describeFocus(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return "body";
    return `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 40)}"`;
  });
}

/**
 * One cart state. At 1440 a full-page shot. At 390 a full-page shot would draw
 * the fixed «До сплати» bar in the middle of the page (Playwright stitches the
 * fixed layer once), so it is two viewport shots instead: the rows from the top
 * (`-top-`) and the summary card with the bulk button scrolled to the centre.
 */
async function stateShot(
  page: Page,
  state: string,
  size: string,
  anchor: ReturnType<typeof removeButton>,
): Promise<void> {
  if (size === "1440") {
    await shot(page, `${state}-page-${size}`, true);
    return;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, `${state}-top-page-${size}`, false);
  await anchor.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(200);
  await shot(page, `${state}-page-${size}`, false);
}

/** The computed look of the bulk button, logged next to the mockup's `.ca-rmall`. */
async function describeButton(
  anchor: ReturnType<typeof removeButton>,
): Promise<string> {
  return anchor.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const icon = el.querySelector("svg");
    return JSON.stringify({
      w: r.width,
      h: r.height,
      radius: cs.borderRadius,
      color: cs.color,
      border: `${cs.borderWidth} ${cs.borderColor}`,
      bg: cs.backgroundColor,
      font: `${cs.fontSize}/${cs.fontWeight}`,
      gap: cs.gap,
      marginTop: cs.marginTop,
      icon: icon
        ? `${icon.getAttribute("width")}x${icon.getAttribute("height")} ${icon.getBoundingClientRect().width}`
        : null,
      label: el.getAttribute("aria-label"),
      text: (el.textContent ?? "").trim(),
    });
  });
}

test.beforeAll(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

test.beforeEach(async () => {
  test.setTimeout(240_000);
  await seedProducts();
});

for (const [size, viewport] of VIEWPORTS) {
  test.describe(`TASK-657 cart page at ${size}`, () => {
    test.use({ viewport });

    test(`unavailable 1 → 2 → cleaned (${size})`, async ({ page }) => {
      for (const key of ["airpods", "spigen", "anker"] as const) {
        await addToCart(page, key);
      }

      // #unavailable-1 — one withdrawn line.
      await setActive(["anker"], false);
      await openCart(page);
      await expect(removeButton(page, "main")).toHaveText(
        "Прибрати 1 недоступний товар",
        { timeout: RENDER_TIMEOUT_MS },
      );
      await stateShot(page, "unavailable-1", size, removeButton(page, "main"));

      // #unavailable — two withdrawn lines.
      await setActive(["spigen"], false);
      await openCart(page);
      const button = removeButton(page, "main");
      await expect(button).toHaveText("Прибрати 2 недоступні товари", {
        timeout: RENDER_TIMEOUT_MS,
      });
      await stateShot(page, "unavailable-2", size, button);
      note(`${size} page button ${await describeButton(button)}`);

      // Keyboard focus ring on the button, the way a keyboard user meets it.
      await button.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await button.scrollIntoViewIfNeeded();
      await shot(page, `unavailable-2-focus-page-${size}`, false);

      // #cleaned — one click, one toast, checkout unblocked.
      await button.press("Enter");
      await expect(
        page.getByText("Прибрано 2 недоступні товари з кошика"),
      ).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
      await expect(removeButton(page, "main")).toHaveCount(0);
      await page.waitForTimeout(300);
      note(`${size} focus after cleanup: ${await describeFocus(page)}`);
      // Does the toast sit on top of the element that just received focus?
      const covered = await page.evaluate(() => {
        const focused = document.activeElement;
        const toast = document.querySelector("[data-sonner-toast]");
        if (!focused || !toast) return null;
        const a = focused.getBoundingClientRect();
        const b = toast.getBoundingClientRect();
        const overlap =
          a.left < b.right &&
          b.left < a.right &&
          a.top < b.bottom &&
          b.top < a.bottom;
        return { focused: a.toJSON(), toast: b.toJSON(), overlap };
      });
      note(`${size} toast vs focused CTA: ${JSON.stringify(covered)}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, `cleaned-page-${size}`, false);
    });

    test(`cart sheet with an unavailable line (${size})`, async ({ page }) => {
      await addToCart(page, "airpods");
      await addToCart(page, "anker");
      await setActive(["anker"], false);

      await page.goto("/");
      const trigger = page
        .getByRole("banner")
        .getByRole("button", { name: "Відкрити кошик", exact: true });
      await waitForHydration(trigger);
      await trigger.click();
      const button = removeButton(page, "dialog");
      await expect(button).toHaveText("Прибрати 1 недоступний товар", {
        timeout: RENDER_TIMEOUT_MS,
      });
      await page.waitForTimeout(500);
      await shot(page, `sheet-page-${size}`, false);
      note(`${size} sheet button ${await describeButton(button)}`);

      await button.click();
      await expect(
        page
          .getByRole("dialog")
          .getByText("Прибрано 1 недоступний товар з кошика"),
      ).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
      await page.waitForTimeout(300);
      note(`${size} sheet focus after cleanup: ${await describeFocus(page)}`);
      await shot(page, `sheet-cleaned-page-${size}`, false);
    });
  });
}
