import * as fs from "node:fs";
import * as path from "node:path";
import { test, type Page } from "./fixtures/test";
import { API_PORT } from "./fixtures/ports";

/**
 * SД3 screenshot harness (Д3-2 mockups → code) — evidence, not a regression gate.
 *
 * SKIPPED unless `D3_SHOTS` is `before` or `after`. With it set, every screen is
 * written to `docs/images/d3/<D3_SHOTS>/<screen>-<1440|390>.png`, so the same spec
 * run before and after the wave yields a like-for-like pair.
 *
 *   D3_SHOTS=before DATABASE_URL=postgresql://postgres:postgres@localhost:5432/store_pw \
 *     npx playwright test e2e/screens-d3.spec.ts
 *
 * Run it against `store_pw` (the screenshot DB), as with `screens-190.spec.ts`.
 * Screens that do not exist yet (the device hub, «Мої пристрої») are captured
 * only in the `after` run. A screen that cannot be reached is skipped with a
 * console note instead of failing — a missing picture must not cost the rest.
 */

const MODE = process.env.D3_SHOTS;
const ENABLED = MODE === "before" || MODE === "after";
const OUT_DIR = path.resolve(__dirname, "../docs/images/d3", MODE ?? "off");

const VIEWPORTS = [
  { label: "1440", width: 1440, height: 900 },
  { label: "390", width: 390, height: 844 },
] as const;

/** Cold dev-mode compiles dominate every first navigation. */
const RENDER_TIMEOUT_MS = 30_000;
const CARD_LINK = '#main-content a[href^="/products/"]';
const API = `http://localhost:${API_PORT}/api`;

test.skip(!ENABLED, "set D3_SHOTS=before|after to capture SД3 shots");

test.beforeEach(() => {
  test.setTimeout(240_000);
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

function note(message: string): void {
  console.log(`[screens-d3] ${message}`);
}

async function shoot(page: Page, name: string, url: string): Promise<void> {
  for (const vp of VIEWPORTS) {
    try {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: RENDER_TIMEOUT_MS,
      });
      await page.screenshot({
        path: path.join(OUT_DIR, `${name}-${vp.label}.png`),
        fullPage: true,
      });
    } catch (error) {
      note(
        `skipped ${name} @ ${vp.label}: ${(error as Error).message.split("\n")[0]}`,
      );
    }
  }
}

/** The first product link on the catalogue — the PDP shot follows real data. */
async function firstProductPath(page: Page): Promise<string | null> {
  await page.goto("/products", {
    waitUntil: "networkidle",
    timeout: RENDER_TIMEOUT_MS,
  });
  return page.locator(CARD_LINK).first().getAttribute("href");
}

/** A device model that has products — the hub must not be an empty 404. */
async function firstHubDeviceSlug(page: Page): Promise<string | null> {
  const res = await page.request.get(`${API}/catalog/compat-pages`);
  if (!res.ok()) return null;
  const body = (await res.json()) as { data?: Array<{ deviceSlug?: string }> };
  return body.data?.find((p) => p.deviceSlug)?.deviceSlug ?? null;
}

test("home", async ({ page }) => {
  await shoot(page, "home", "/");
});

test("catalog", async ({ page }) => {
  await shoot(page, "catalog", "/products");
});

test("pdp", async ({ page }) => {
  const href = await firstProductPath(page);
  if (!href) return note("skipped pdp: no product card on /products");
  await shoot(page, "pdp", href);
});

test("search by model", async ({ page }) => {
  await shoot(
    page,
    "search-model",
    "/search?q=iphone%2015%20%D0%BF%D1%80%D0%BE",
  );
});

test("wishlist", async ({ page }) => {
  await shoot(page, "wishlist", "/wishlist");
});

test("my devices", async ({ page }) => {
  test.skip(MODE !== "after", "«Мої пристрої» exist only after SД3");
  await shoot(page, "devices", "/devices");
});

test("device hub", async ({ page }) => {
  test.skip(MODE !== "after", "the device hub exists only after SД3");
  const slug = await firstHubDeviceSlug(page);
  if (!slug) return note("skipped device hub: no compat page in the DB");
  await shoot(page, "device-hub", `/devices/${slug}`);
});
