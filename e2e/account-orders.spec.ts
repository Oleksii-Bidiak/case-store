import { test, expect, type Page } from "./fixtures/test";
import {
  E2E_ORDER_PENDING_ID,
  E2E_USER_EMAIL,
  E2E_USER_PASSWORD,
} from "./fixtures/seed-e2e";
import { waitForHydration } from "./fixtures/hydration";

/**
 * Orders in the account (TASK-217) and URL-addressed account sections
 * (TASK-867).
 *
 * jsdom can pin which status the tabs ask for and which classes hide the
 * sidebar; it cannot see a 308 leave the server, a sign-in come back to the
 * page it left, or a 390px screen actually show the chip strip instead of the
 * sidebar. This spec does those.
 *
 * Seed (`seed-e2e.ts`): the e2e customer holds three open orders — PENDING and
 * PROCESSING cash on delivery, CONFIRMED paid online — so «Активні» lists all
 * three and «Доставлені» lists none.
 */

const VIEWPORT_HEIGHT = 900;
const SECTIONS_NAV = "Розділи кабінету";
const ORDER_REF = E2E_ORDER_PENDING_ID.slice(0, 8).toUpperCase();

async function signIn(page: Page): Promise<void> {
  const submitName = { name: /^увійти$/i };
  const form = page
    .getByRole("main")
    .locator("form")
    .filter({ has: page.getByRole("button", submitName) });
  await waitForHydration(form);
  await page.getByLabel(/(пошта|email)/i).fill(E2E_USER_EMAIL);
  await page.getByLabel(/(пароль|password)/i).fill(E2E_USER_PASSWORD);
  await form.getByRole("button", submitName).click();
}

async function expectNoHorizontalScroll(page: Page, width: number) {
  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(scrollWidth).toBeLessThanOrEqual(width);
}

test.describe("old /orders URLs (TASK-217)", () => {
  for (const [from, to] of [
    ["/orders", "/account/orders"],
    ["/orders?status=active&page=2", "/account/orders?status=active&page=2"],
    [
      `/orders/${E2E_ORDER_PENDING_ID}`,
      `/account/orders/${E2E_ORDER_PENDING_ID}`,
    ],
  ] as const) {
    test(`${from} answers 308 → ${to}`, async ({ request }) => {
      const response = await request.get(from, { maxRedirects: 0 });
      expect(response.status()).toBe(308);
      // Absolute or relative — only the path and query are ours to pin.
      const location = new URL(response.headers()["location"], "http://x");
      expect(location.pathname + location.search).toBe(to);
    });
  }

  for (const path of [
    "/orders/status",
    "/orders/guest/not-a-real-token",
    `/orders/${E2E_ORDER_PENDING_ID}/confirmation`,
  ]) {
    test(`${path} keeps answering itself`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(200);
    });
  }
});

test.describe("sign-in returns to the account page it left (TASK-419)", () => {
  for (const path of [
    "/account/orders?status=active",
    `/account/orders/${E2E_ORDER_PENDING_ID}`,
  ]) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?redirect=/);
      await signIn(page);
      await expect(page).toHaveURL(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  }
});

test.describe("order history and detail in the account (TASK-217)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await signIn(page);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("1440: the sidebar, the tabs, and a tab that filters", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: VIEWPORT_HEIGHT });
    await page.goto("/account/orders");
    const main = page.getByRole("main");

    await expect(
      main.getByRole("heading", { level: 1, name: "Історія замовлень" }),
    ).toBeVisible();
    // The sidebar, not the strip, and the orders entry is the current one.
    const nav = main.getByRole("navigation", { name: SECTIONS_NAV });
    await expect(nav).toHaveCount(1);
    await expect(
      nav.getByRole("link", { name: "Історія замовлень" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(main.locator("article")).toHaveCount(3);

    await main.getByRole("tab", { name: /^Доставлені/ }).click();
    await expect(page).toHaveURL(/status=delivered/);
    await expect(main.getByText("Тут поки немає замовлень.")).toBeVisible();

    await main.getByRole("tab", { name: /^Активні/ }).click();
    await expect(page).toHaveURL(/status=active/);
    await expect(main.locator("article")).toHaveCount(3);

    await main
      .getByRole("link", { name: `Замовлення #${ORDER_REF}`, exact: true })
      .click();
    await expect(page).toHaveURL(`/account/orders/${E2E_ORDER_PENDING_ID}`);
    await expectNoHorizontalScroll(page, 1440);
  });

  test("390: the chip strip replaces the sidebar on the list", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: VIEWPORT_HEIGHT });
    await page.goto("/account/orders");
    const main = page.getByRole("main");

    await expect(
      main.getByRole("heading", { level: 1, name: "Історія замовлень" }),
    ).toBeVisible();
    const strip = main.getByRole("navigation", { name: SECTIONS_NAV });
    await expect(strip).toHaveCount(1);
    const current = strip.getByRole("link", { name: "Історія замовлень" });
    await expect(current).toHaveAttribute("aria-current", "page");
    await expect(current).toBeInViewport();
    // The strip's items sit in one row: «Вихід» is the sidebar's, not the strip's.
    await expect(strip.getByRole("button", { name: "Вихід" })).toHaveCount(0);
    await expectNoHorizontalScroll(page, 390);
  });

  for (const width of [1440, 390]) {
    test(`${width}: the detail — timeline, summary, back link`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
      await page.goto(`/account/orders/${E2E_ORDER_PENDING_ID}`);
      const main = page.getByRole("main");

      await expect(
        main.getByRole("heading", {
          level: 1,
          name: `Замовлення #${ORDER_REF}`,
        }),
      ).toBeVisible();
      const timeline = main.getByRole("list", { name: "Етапи замовлення" });
      await expect(timeline).toBeVisible();
      await expect(timeline.locator('[aria-current="step"]')).toHaveCount(1);
      await expect(
        main.getByRole("heading", { name: "Підсумок замовлення" }),
      ).toBeVisible();
      // On a phone the detail is the order alone: no section strip.
      await expect(
        main.getByRole("navigation", { name: SECTIONS_NAV }),
      ).toHaveCount(width === 390 ? 0 : 1);
      await expectNoHorizontalScroll(page, width);

      await main
        .getByRole("link", { name: "Історія замовлень" })
        .first()
        .click();
      await expect(page).toHaveURL("/account/orders");
    });
  }

  test("an order that is not yours (or does not exist) says so", async ({
    page,
  }) => {
    await page.goto("/account/orders/00000000-0000-4000-8000-000000000000");
    await expect(
      page.getByRole("heading", { name: "Не вдалося знайти це замовлення" }),
    ).toBeVisible();
  });

  test("an account section survives a reload (TASK-867)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: VIEWPORT_HEIGHT });
    await page.goto("/account?section=settings");
    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { name: "Оформлення" }),
    ).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL("/account?section=settings");
    await expect(
      main.getByRole("heading", { name: "Оформлення" }),
    ).toBeVisible();
  });
});
