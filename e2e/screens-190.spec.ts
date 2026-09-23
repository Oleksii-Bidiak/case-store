import * as fs from "node:fs";
import * as path from "node:path";
import { test, expect, type Page } from "./fixtures/test";
import {
  E2E_ORDER_PROCESSING_ID,
  E2E_PRODUCT_SLUG,
  E2E_USER_EMAIL,
  E2E_USER_PASSWORD,
} from "./fixtures/seed-e2e";
import { addSeededProductToCart } from "./fixtures/cart";
import { loginAsAdmin } from "./fixtures/admin-session";

/**
 * Plan 190 screenshot harness — evidence, not a regression gate.
 *
 * SKIPPED unless `SCREENS_190` is `before` or `after`. With it set, every test
 * writes PNGs to `docs/images/190/<SCREENS_190>/<name>.png` and merges numbers
 * into `docs/images/190/<SCREENS_190>/measurements.json`, so the same spec run
 * before and after the wave yields a like-for-like pair.
 *
 *   SCREENS_190=before DATABASE_URL=postgresql://postgres:postgres@localhost:5432/store_pw \
 *     npx playwright test e2e/screens-190.spec.ts
 *
 * Run it against `store_pw` (the screenshot DB), never `store_test`: the shots
 * are only comparable when the data under them is. Seeding `store_pw` with the
 * dev seed first (`npx tsx prisma/seed.ts` from apps/store-api, same
 * DATABASE_URL) gives a real catalogue instead of the one e2e fixture product.
 *
 * A screen that cannot be reached (an empty list, a control that moved) is
 * skipped with a console note instead of failing — a missing picture must not
 * cost the rest of the set.
 *
 * Two measurements ride along:
 *   - TASK-510: at 900×800 the storefront's `body` width with and without a
 *     Radix overlay open. Chromium headless hides scrollbars by default
 *     (`--hide-scrollbars`), which would make the shift unmeasurable, so that
 *     test launches its own browser without the flag.
 *   - TASK-732: the admin orders search box at 1440×900 — its size, whether it
 *     is visible, and whether `elementFromPoint` at its centre is the box
 *     itself (i.e. nothing is drawn over it).
 *
 * This file lives in the storefront (`chromium`) project, because the `admin`
 * project only matches `admin-*.spec.ts`; the admin block switches `baseURL`
 * to :3002 itself.
 */

const MODE = process.env.SCREENS_190;
const ENABLED = MODE === "before" || MODE === "after";
const OUT_DIR = path.resolve(__dirname, "../docs/images/190", MODE ?? "off");
const MEASUREMENTS_FILE = path.join(OUT_DIR, "measurements.json");

const ADMIN_BASE_URL = "http://localhost:3002";
const DESKTOP = { width: 1440, height: 900 } as const;
const PHONE = { width: 390, height: 844 } as const;
/** TASK-510 reproduces at 900px: the burger menu and filter drawer are `lg:hidden`. */
const TABLET = { width: 900, height: 800 } as const;

/** Cold dev-mode compiles dominate every first navigation. */
const RENDER_TIMEOUT_MS = 30_000;

const CARD_LINK = '#main-content a[href^="/products/"]';

test.skip(!ENABLED, "set SCREENS_190=before|after to capture plan 190 shots");

test.beforeEach(() => {
  test.setTimeout(180_000);
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

// ---------------------------------------------------------------- helpers

function note(message: string): void {
  console.log(`[screens-190] ${message}`);
}

/** Run one screen; on any failure log why and mark the test skipped. */
async function capture(name: string, body: () => Promise<void>): Promise<void> {
  try {
    await body();
  } catch (error) {
    const reason = (error as Error).message.split("\n")[0];
    note(`${name}: not captured — ${reason}`);
    test.skip(true, `${name} unreachable: ${reason}`);
  }
}

async function shot(
  page: Page,
  name: string,
  { fullPage = true }: { fullPage?: boolean } = {},
): Promise<void> {
  await page.screenshot({
    path: path.join(OUT_DIR, `${name}.png`),
    fullPage,
    animations: "disabled",
    caret: "hide",
  });
  note(`${name}.png written`);
}

/**
 * Scroll to the bottom and back so lazy images below the fold load before a
 * full-page shot, then give the network a moment to go quiet.
 */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {
    // A long-polling request or an analytics beacon keeps the network busy;
    // the shot is still worth taking.
  });
}

/** Merge `entry` under `key` into this mode's measurements.json. */
function recordMeasurement(key: string, entry: unknown): void {
  let current: Record<string, unknown> = {};
  try {
    current = JSON.parse(fs.readFileSync(MEASUREMENTS_FILE, "utf8"));
  } catch {
    // First write of the run, or an unreadable file — start fresh.
  }
  current[key] = entry;
  current.meta = {
    mode: MODE,
    capturedAt: new Date().toISOString(),
    note: "Written by e2e/screens-190.spec.ts. Widths are CSS px.",
  };
  fs.writeFileSync(MEASUREMENTS_FILE, `${JSON.stringify(current, null, 2)}\n`);
}

async function signInCustomer(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/(пошта|email)/i).fill(E2E_USER_EMAIL);
  await page.getByLabel(/(пароль|password)/i).fill(E2E_USER_PASSWORD);
  await page
    .getByRole("main")
    .getByRole("button", { name: /^увійти$/i })
    .click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: RENDER_TIMEOUT_MS });
}

/**
 * `loginAsAdmin`, retried once: the first sign-in of a run lands on a
 * dashboard the dev server has not compiled yet, and the redirect can outlast
 * the fixture's 5-second expectation. Each test has its own rate-limit
 * bucket, so a second attempt costs nothing.
 */
async function signInAdmin(page: Page): Promise<void> {
  try {
    await loginAsAdmin(page);
  } catch {
    note("admin sign-in retried after a cold-compile timeout");
    await loginAsAdmin(page);
  }
}

async function waitForCards(page: Page): Promise<void> {
  await expect(page.locator(CARD_LINK).first()).toBeVisible({
    timeout: RENDER_TIMEOUT_MS,
  });
}

/** What TASK-510 is about: how wide the page is, and who pays for the gutter. */
interface LayoutWidths {
  bodyWidth: number;
  innerWidth: number;
  docClientWidth: number;
  docOffsetWidth: number;
  scrollbarWidth: number;
  bodyMarginRight: string;
  bodyPaddingRight: string;
  htmlScrollbarGutter: string;
  scrollLocked: boolean;
}

async function measureWidths(page: Page): Promise<LayoutWidths> {
  return page.evaluate<LayoutWidths>(() => {
    const html = document.documentElement;
    const body = document.body;
    const bodyStyle = getComputedStyle(body);
    return {
      bodyWidth: body.getBoundingClientRect().width,
      innerWidth: window.innerWidth,
      docClientWidth: html.clientWidth,
      docOffsetWidth: html.offsetWidth,
      // The reliable gauge the backlog row names: innerWidth − offsetWidth.
      scrollbarWidth: window.innerWidth - html.offsetWidth,
      bodyMarginRight: bodyStyle.marginRight,
      bodyPaddingRight: bodyStyle.paddingRight,
      htmlScrollbarGutter:
        getComputedStyle(html).getPropertyValue("scrollbar-gutter"),
      scrollLocked: body.hasAttribute("data-scroll-locked"),
    };
  });
}

// ------------------------------------------------------------ storefront

test.describe("plan 190 storefront screens", () => {
  test.use({ viewport: DESKTOP });

  test("home", async ({ page }) => {
    await capture("sf-home", async () => {
      await page.goto("/");
      await expect(page.locator("#main-content h1").first()).toBeVisible({
        timeout: RENDER_TIMEOUT_MS,
      });
      await settle(page);
      await shot(page, "sf-home");
    });
  });

  test("catalog listing", async ({ page }) => {
    await capture("sf-catalog", async () => {
      await page.goto("/products");
      await waitForCards(page);
      await settle(page);
      await shot(page, "sf-catalog");
    });
  });

  test("product page", async ({ page }) => {
    await capture("sf-product", async () => {
      await page.goto("/products");
      const href = await page
        .locator(CARD_LINK)
        .first()
        .getAttribute("href", { timeout: RENDER_TIMEOUT_MS })
        .catch(() => null);
      const target =
        href && /^\/products\/[^/?#]+$/.test(href)
          ? href
          : `/products/${E2E_PRODUCT_SLUG}`;
      await page.goto(target);
      await expect(page.locator("#main-content h1").first()).toBeVisible({
        timeout: RENDER_TIMEOUT_MS,
      });
      await settle(page);
      await shot(page, "sf-product");
    });
  });

  test("product card hover", async ({ page }) => {
    await capture("sf-card-hover", async () => {
      await page.goto("/products");
      await waitForCards(page);
      const link = page.locator(CARD_LINK).first();
      // The card is the nearest `group` ancestor (Tailwind `group-hover:`
      // drives the hover state); fall back to the link itself.
      const groupCard = link.locator(
        "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' group ')][1]",
      );
      const card = (await groupCard.count()) > 0 ? groupCard : link;
      await card.scrollIntoViewIfNeeded();
      await card.hover();
      // Let the hover transition finish (shadow/lift/secondary image).
      await page.waitForTimeout(600);
      await card.screenshot({
        path: path.join(OUT_DIR, "sf-card-hover.png"),
        animations: "allow",
      });
      note("sf-card-hover.png written");
    });
  });

  test("checkout with a field error", async ({ page }) => {
    await capture("sf-checkout-error", async () => {
      await addSeededProductToCart(page);
      await page.goto("/checkout");
      await expect(page).toHaveURL(/\/checkout$/);
      await page
        .getByRole("main")
        .getByRole("button", { name: /^(далі|підтвердити замовлення)$/i })
        .first()
        .click();
      const invalid = page.locator('[aria-invalid="true"]').first();
      await expect(invalid).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
      await invalid.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await shot(page, "sf-checkout-error", { fullPage: false });
    });
  });

  test("login with an input error", async ({ page }) => {
    await capture("sf-login-error", async () => {
      await page.goto("/login");
      await page.getByLabel(/(пошта|email)/i).fill("not-an-email");
      await page
        .getByRole("main")
        .getByRole("button", { name: /^увійти$/i })
        .click();
      await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible({
        timeout: RENDER_TIMEOUT_MS,
      });
      await shot(page, "sf-login-error", { fullPage: false });
    });
  });

  test("account page", async ({ page }) => {
    await capture("sf-account", async () => {
      await signInCustomer(page);
      await page.goto("/account");
      await expect(page).toHaveURL(/\/account/);
      await expect(page.locator("#main-content h1").first()).toBeVisible({
        timeout: RENDER_TIMEOUT_MS,
      });
      await settle(page);
      await shot(page, "sf-account");
    });
  });
});

test.describe("plan 190 storefront phone screens", () => {
  test.use({ viewport: PHONE });

  test("home at 390", async ({ page }) => {
    await capture("sf-home-390", async () => {
      await page.goto("/");
      await expect(page.locator("#main-content h1").first()).toBeVisible({
        timeout: RENDER_TIMEOUT_MS,
      });
      await shot(page, "sf-home-390", { fullPage: false });
    });
  });

  test("mobile menu drawer at 390", async ({ page }) => {
    await capture("sf-menu-390", async () => {
      await page.goto("/");
      await page.getByRole("button", { name: "Відкрити меню" }).click();
      await expect(page.getByRole("dialog").first()).toBeVisible({
        timeout: RENDER_TIMEOUT_MS,
      });
      await page.waitForTimeout(500);
      await shot(page, "sf-menu-390", { fullPage: false });
    });
  });

  test("filters drawer at 390", async ({ page }) => {
    await capture("sf-filters-390", async () => {
      await page.goto("/products");
      await waitForCards(page);
      await page
        .getByRole("main")
        .getByRole("button", { name: /^фільтри/i })
        .click();
      await expect(page.getByRole("dialog").first()).toBeVisible({
        timeout: RENDER_TIMEOUT_MS,
      });
      await page.waitForTimeout(500);
      await shot(page, "sf-filters-390", { fullPage: false });
    });
  });
});

test.describe("TASK-510 overlay shift at 900px", () => {
  test("body width with the mobile menu and the filter drawer open", async ({
    playwright,
    baseURL,
    extraHTTPHeaders,
  }) => {
    // Real scrollbars: without them there is no gutter to lose, and the shift
    // the backlog row describes cannot happen in the harness. `launchOptions`
    // cannot be overridden per describe (it forces a new worker), so this test
    // launches its own browser without Playwright's `--hide-scrollbars`.
    const browser = await playwright.chromium.launch({
      ignoreDefaultArgs: ["--hide-scrollbars"],
    });
    const context = await browser.newContext({
      viewport: TABLET,
      baseURL,
      extraHTTPHeaders,
    });
    const page = await context.newPage();
    try {
      await measureTask510(page);
    } finally {
      await context.close();
      await browser.close();
    }
  });
});

async function measureTask510(page: Page): Promise<void> {
  const result: Record<string, unknown> = { viewport: TABLET };

  await page.goto("/");
  await expect(page.locator("#main-content h1").first()).toBeVisible({
    timeout: RENDER_TIMEOUT_MS,
  });
  const menuBefore = await measureWidths(page);
  await page.getByRole("button", { name: "Відкрити меню" }).click();
  await expect(page.getByRole("dialog").first()).toBeVisible();
  await page.waitForTimeout(400);
  const menuOpen = await measureWidths(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.waitForTimeout(400);
  const menuAfter = await measureWidths(page);
  result.mobileMenu = {
    route: "/",
    before: menuBefore,
    open: menuOpen,
    afterClose: menuAfter,
    shiftPx: menuOpen.bodyWidth - menuBefore.bodyWidth,
  };

  try {
    await page.goto("/products");
    await waitForCards(page);
    const filtersBefore = await measureWidths(page);
    await page
      .getByRole("main")
      .getByRole("button", { name: /^фільтри/i })
      .click();
    await expect(page.getByRole("dialog").first()).toBeVisible();
    await page.waitForTimeout(400);
    const filtersOpen = await measureWidths(page);
    result.filterDrawer = {
      route: "/products",
      before: filtersBefore,
      open: filtersOpen,
      shiftPx: filtersOpen.bodyWidth - filtersBefore.bodyWidth,
    };
  } catch (error) {
    const reason = (error as Error).message.split("\n")[0];
    note(`TASK-510 filter drawer not measured — ${reason}`);
    result.filterDrawer = { skipped: reason };
  }

  recordMeasurement("task510", result);
  note(`TASK-510: ${JSON.stringify(result)}`);
}

// ------------------------------------------------------------------ admin

test.describe("plan 190 admin screens", () => {
  test.use({ viewport: DESKTOP, baseURL: ADMIN_BASE_URL });

  test("admin login", async ({ page }) => {
    await capture("ad-login", async () => {
      await page.goto("/login");
      await expect(page.getByLabel(/пароль/i)).toBeVisible({
        timeout: RENDER_TIMEOUT_MS,
      });
      await shot(page, "ad-login", { fullPage: false });
    });
  });

  test("orders list at 1440 + TASK-732 search box", async ({ page }) => {
    await signInAdmin(page);
    await page.goto("/orders");
    const search = page.getByRole("searchbox", { name: "Пошук замовлень" });
    await expect(search).toBeAttached({ timeout: RENDER_TIMEOUT_MS });
    await expect(page.getByRole("table").first()).toBeVisible({
      timeout: RENDER_TIMEOUT_MS,
    });
    await page.waitForTimeout(500);

    const box = await search.boundingBox();
    const visible = await search.isVisible();
    const hit = await search.evaluate((input) => {
      const rect = input.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const top = document.elementFromPoint(x, y);
      const describe = (el: Element | null): string | null => {
        if (!el) return null;
        const cls = (el.getAttribute("class") ?? "")
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 4)
          .join(".");
        const label = el.getAttribute("aria-label");
        return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}${
          label ? `[aria-label="${label}"]` : ""
        }`;
      };
      return {
        centre: { x, y },
        elementAtCentre: describe(top),
        centreIsInput: top === input,
      };
    });
    const tabs = await page
      .getByRole("tablist")
      .first()
      .boundingBox()
      .catch(() => null);

    recordMeasurement("task732", {
      viewport: DESKTOP,
      route: "/orders",
      searchInput: {
        visible,
        width: box?.width ?? null,
        height: box?.height ?? null,
        x: box?.x ?? null,
        y: box?.y ?? null,
        ...hit,
      },
      statusTabs: tabs,
    });
    note(`TASK-732: ${JSON.stringify({ box, visible, hit })}`);

    await shot(page, "ad-orders-1440", { fullPage: false });
  });

  test("products list", async ({ page }) => {
    await capture("ad-products", async () => {
      await signInAdmin(page);
      await page.goto("/products");
      await expect(page.getByRole("table").first()).toBeVisible({
        timeout: RENDER_TIMEOUT_MS,
      });
      await page.waitForTimeout(500);
      await shot(page, "ad-products", { fullPage: false });
    });
  });

  test("return resolve form or order detail", async ({ page }) => {
    await signInAdmin(page);

    let returned = false;
    await page.goto("/returns");
    const returnLink = page.locator('main a[href^="/returns/"]').first();
    if (
      await returnLink
        .waitFor({ state: "visible", timeout: 10_000 })
        .then(() => true)
        .catch(() => false)
    ) {
      await returnLink.click();
      await expect(page).toHaveURL(/\/returns\/[^/]+$/);
      await page.waitForTimeout(1_000);
      await shot(page, "ad-return-detail");
      returned = true;
    } else {
      note(
        "ad-return-detail: no return request in the DB — order detail instead",
      );
    }

    await capture("ad-order-detail", async () => {
      await page.goto(`/orders/${E2E_ORDER_PROCESSING_ID}`);
      await expect(
        page.getByText(E2E_ORDER_PROCESSING_ID.slice(0, 8)).first(),
      ).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
      await page.waitForTimeout(800);
      await shot(page, "ad-order-detail");
    });
    if (!returned)
      note("ad-order-detail stands in for the return-resolve form");
  });

  test("catalog import page", async ({ page }) => {
    await capture("ad-catalog-import", async () => {
      await signInAdmin(page);
      await page.goto("/catalog-import");
      await expect(page.locator("main h1, main h2").first()).toBeVisible({
        timeout: RENDER_TIMEOUT_MS,
      });
      await page.waitForTimeout(500);
      await shot(page, "ad-catalog-import");
    });
  });

  test("a form with a disabled control", async ({ page }) => {
    await capture("ad-disabled-control", async () => {
      await signInAdmin(page);
      const disabledSelector = [
        "main button:disabled",
        "main input:disabled",
        "main select:disabled",
        "main textarea:disabled",
        'main [aria-disabled="true"]',
      ].join(", ");

      // Pages whose forms usually carry a disabled control on first paint
      // (a save button until the form is dirty, a read-only field).
      for (const route of [
        "/products/new",
        "/settings",
        "/profile",
        "/orders/new",
      ]) {
        await page.goto(route);
        await page
          .locator("main h1")
          .first()
          .waitFor({ timeout: RENDER_TIMEOUT_MS })
          .catch(() => undefined);
        await page.waitForTimeout(800);
        // Prefer a control a reader can recognise — a labelled button or a
        // field — over an icon-only button.
        const all = page.locator(disabledSelector);
        const count = await all.count();
        let control = null;
        for (let i = 0; i < count && !control; i += 1) {
          const candidate = all.nth(i);
          if (!(await candidate.isVisible().catch(() => false))) continue;
          const readable = await candidate.evaluate(
            (el) =>
              ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) ||
              (el.textContent ?? "").trim().length > 0,
          );
          if (readable) control = candidate;
        }
        if (control) {
          await control.scrollIntoViewIfNeeded();
          const described = await control.evaluate(
            (el) =>
              `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 40)}"`,
          );
          note(`ad-disabled-control: ${route} → ${described}`);
          recordMeasurement("disabledControlScreen", {
            route,
            control: described,
          });
          await shot(page, "ad-disabled-control", { fullPage: false });
          return;
        }
      }
      throw new Error("no visible disabled control on the candidate pages");
    });
  });
});
