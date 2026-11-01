import * as fs from "node:fs";
import * as path from "node:path";
import { test, type Page } from "./fixtures/test";
import { loginAsAdmin } from "./fixtures/admin-session";

/**
 * SД3b admin screenshot harness (TASK-1955 «Масова сумісність», DeviceCompat.dc.html)
 * — evidence, not a regression gate. The admin half of `screens-d3.spec.ts`: it
 * lives in its own file only because the Playwright `admin` project (admin
 * baseURL) matches `admin-*.spec.ts`.
 *
 * SKIPPED unless `D3_SHOTS` is `before` or `after`. Writes
 * `docs/images/<D3_SET|d3b>/<D3_SHOTS>/admin-<screen>-<1440|390>.png`.
 *
 *   D3_SHOTS=before D3_SET=d3b DATABASE_URL=postgresql://postgres:postgres@localhost:5432/store_pw \
 *     npx playwright test e2e/admin-screens-d3.spec.ts e2e/screens-d3.spec.ts
 *
 * Screens: the product form's compatibility section (artboard 1), the products
 * list (artboard 2 — the bulk action lives there), the device models list, and —
 * `after` only — a model's coverage page (artboard 3). A screen that cannot be
 * reached is skipped with a console note instead of failing.
 */

const MODE = process.env.D3_SHOTS;
const ENABLED = MODE === "before" || MODE === "after";
const SET = process.env.D3_SET ?? "d3b";
const OUT_DIR = path.resolve(__dirname, "../docs/images", SET, MODE ?? "off");
const RENDER_TIMEOUT_MS = 30_000;

const VIEWPORTS = [
  { label: "1440", width: 1440, height: 900 },
  { label: "390", width: 390, height: 844 },
] as const;

test.skip(!ENABLED, "set D3_SHOTS=before|after to capture SД3b admin shots");

test.beforeEach(async ({ page }) => {
  test.setTimeout(240_000);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await loginAsAdmin(page);
});

function note(message: string): void {
  console.log(`[admin-screens-d3] ${message}`);
}

async function shoot(
  page: Page,
  name: string,
  url: string,
  focusText?: RegExp,
): Promise<void> {
  for (const vp of VIEWPORTS) {
    try {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: RENDER_TIMEOUT_MS,
      });
      if (focusText) {
        await page
          .getByText(focusText)
          .first()
          .scrollIntoViewIfNeeded({ timeout: RENDER_TIMEOUT_MS });
      }
      await page.screenshot({
        path: path.join(OUT_DIR, `admin-${name}-${vp.label}.png`),
        fullPage: !focusText,
      });
    } catch (error) {
      note(
        `skipped ${name} @ ${vp.label}: ${(error as Error).message.split("\n")[0]}`,
      );
    }
  }
}

/** First href on a list page matching `pattern` — the shots follow real data. */
async function firstHref(
  page: Page,
  listUrl: string,
  pattern: string,
): Promise<string | null> {
  await page.goto(listUrl, {
    waitUntil: "networkidle",
    timeout: RENDER_TIMEOUT_MS,
  });
  // Skip the list's own action links («Новий …», preview) — a row link is wanted.
  return page
    .locator(
      `a[href^="${pattern}"]:not([href$="/new"]):not([href*="/preview"])`,
    )
    .first()
    .getAttribute("href");
}

test("product form — compatibility", async ({ page }) => {
  const href = await firstHref(page, "/products", "/products/");
  const editHref = href?.match(/^\/products\/[^/]+/)?.[0];
  if (!editHref) return note("skipped product form: no product row");
  await shoot(page, "product-compat", `${editHref}/edit`, /Сумісні пристрої/);
});

test("products list", async ({ page }) => {
  await shoot(page, "products", "/products");
});

test("device models", async ({ page }) => {
  await shoot(page, "device-models", "/devices/models");
});

test("device model coverage", async ({ page }) => {
  test.skip(MODE !== "after", "the coverage screen exists only after SД3b");
  const href = await firstHref(page, "/devices/models", "/devices/models/");
  const id = href?.match(/^\/devices\/models\/([^/]+)/)?.[1];
  if (!id || id === "new") return note("skipped coverage: no model row");
  await shoot(page, "device-coverage", `/devices/models/${id}/coverage`);
});
