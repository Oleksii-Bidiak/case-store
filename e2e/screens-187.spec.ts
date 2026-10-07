import * as fs from "node:fs";
import * as path from "node:path";
import type { Route } from "@playwright/test";
import { test, expect, type Page } from "./fixtures/test";
import { addSeededProductToCart } from "./fixtures/cart";
import { waitForHydration } from "./fixtures/hydration";
import { E2E_USER_EMAIL, E2E_USER_PASSWORD } from "./fixtures/seed-e2e";

/**
 * TASK-679 screenshot harness — Telegram order notifications on the
 * storefront. Evidence for the visual verifier, not a regression gate.
 *
 * SKIPPED unless `SCREENS_187` is set. Writes
 * `.screens-187/679/<name>-page-{1440,390}.png` (and a `<name>-card-…` crop of
 * the card under review), to be read next to the mockup shots in
 * `.screens-187/mockups/` (sf-Account-settings-telegram-*,
 * sf-Checkout-guest-success-*).
 *
 *   SCREENS_187=1 npx playwright test e2e/screens-187.spec.ts
 *
 * The stand has no bot token, so every channel state is forced in the browser
 * with `page.route`:
 *
 *   - account — a real customer login (the e2e seed's), then the three
 *     `/users/me/notifications/telegram` routes (GET status, POST link, DELETE);
 *   - guest — the seeded product in a guest cart, the delivery offer narrowed
 *     to pickup (no Nova Poshta directory needed), `POST /api/orders` answered
 *     with an order carrying `guestAccessToken`, and the two guest routes.
 */

const ENABLED = !!process.env.SCREENS_187;
const OUT_DIR = path.resolve(__dirname, "../.screens-187/679");
const RENDER_TIMEOUT_MS = 30_000;

const VIEWPORTS = [
  ["1440", { width: 1440, height: 900 }],
  ["390", { width: 390, height: 844 }],
] as const;

test.skip(!ENABLED, "set SCREENS_187=1 to capture TASK-679 shots");

const DEEP_LINK = `https://t.me/casestore_bot?start=${"Q".repeat(43)}`;

interface ChannelState {
  available: boolean;
  connected: boolean;
  label?: string;
}

function statusBody(state: ChannelState) {
  return {
    data: {
      available: state.available,
      connected: state.connected,
      ...(state.connected
        ? { label: state.label, createdAt: "2026-10-07T09:00:00.000Z" }
        : {}),
      ...(state.available ? { botUsername: "casestore_bot" } : {}),
    },
  };
}

function linkBody() {
  return {
    data: {
      deepLink: DEEP_LINK,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    },
  };
}

function note(message: string): void {
  console.log(`[screens-187-679] ${message}`);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(250);
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({
    path: file,
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  });
  note(`${name}.png written`);
}

async function cardShot(
  page: Page,
  locator: ReturnType<Page["locator"]>,
  name: string,
): Promise<void> {
  const file = path.join(OUT_DIR, `${name}.png`);
  await locator.screenshot({ path: file, animations: "disabled" });
  note(`${name}.png written`);
}

test.beforeAll(() => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

test.beforeEach(() => {
  test.setTimeout(240_000);
});

// ─── Account → Налаштування → Сповіщення ────────────────────────────────────

async function mockAccountChannel(page: Page, state: ChannelState) {
  await page.route("**/api/users/me/notifications/telegram", (route: Route) => {
    if (route.request().method() === "DELETE") {
      state.connected = false;
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({ json: statusBody(state) });
  });
  await page.route("**/api/users/me/notifications/telegram/link", (route) =>
    route.fulfill({ json: linkBody() }),
  );
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  const submitName = { name: /^увійти$/i };
  const form = page
    .getByRole("main")
    .locator("form")
    .filter({ has: page.getByRole("button", submitName) });
  await waitForHydration(form);
  await page.getByLabel(/(пошта|email)/i).fill(E2E_USER_EMAIL);
  await page.getByLabel(/(пароль|password)/i).fill(E2E_USER_PASSWORD);
  await form.getByRole("button", submitName).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: RENDER_TIMEOUT_MS });
}

async function openSettings(page: Page, expectedText: string) {
  await page.goto("/account?section=settings");
  const row = page.getByTestId("telegram-channel-row");
  await expect(row).toContainText(expectedText, {
    timeout: RENDER_TIMEOUT_MS,
  });
  return row;
}

/** The «Сповіщення» card — the row's nearest card ancestor. */
const notificationsCard = (page: Page) =>
  page
    .getByRole("heading", { name: "Сповіщення", exact: true })
    .locator("xpath=..");

for (const [size, viewport] of VIEWPORTS) {
  test.describe(`TASK-679 account settings at ${size}`, () => {
    test.use({ viewport });

    test(`off → wait → on → na (${size})`, async ({ page }) => {
      const state: ChannelState = { available: true, connected: false };
      await mockAccountChannel(page, state);
      await signIn(page);

      // off
      const row = await openSettings(
        page,
        "Додатково до пошти — підтвердження й відправлення замовлення в чат.",
      );
      await shot(page, `account-telegram-off-page-${size}`);
      await cardShot(
        page,
        notificationsCard(page),
        `account-telegram-off-card-${size}`,
      );

      // wait — the panel under the row, QR from sm up
      const connect = row.getByRole("button", { name: "Підключити" });
      await waitForHydration(connect);
      await connect.click();
      await expect(
        row.getByRole("link", { name: /Відкрити Telegram/ }),
      ).toHaveAttribute("href", DEEP_LINK, { timeout: RENDER_TIMEOUT_MS });
      await shot(page, `account-telegram-wait-page-${size}`);
      await cardShot(
        page,
        notificationsCard(page),
        `account-telegram-wait-card-${size}`,
      );

      // on — «Старт» pressed; the poll (or the button) picks it up
      state.connected = true;
      state.label = "@oleksii_p";
      await row.getByRole("button", { name: "Я натиснув «Старт»" }).click();
      await expect(row).toContainText("Підключено як @oleksii_p", {
        timeout: RENDER_TIMEOUT_MS,
      });
      await shot(page, `account-telegram-on-page-${size}`);
      await cardShot(
        page,
        notificationsCard(page),
        `account-telegram-on-card-${size}`,
      );

      // na — the shop's bot is not available
      state.available = false;
      state.connected = false;
      await openSettings(
        page,
        "Тимчасово недоступно. Листи на пошту приходять як завжди.",
      );
      await shot(page, `account-telegram-na-page-${size}`);
      await cardShot(
        page,
        notificationsCard(page),
        `account-telegram-na-card-${size}`,
      );
    });
  });
}

// ─── Checkout — guest success ───────────────────────────────────────────────

const GUEST_TOKEN = "e".repeat(64);
const GUEST_ORDER_ID = "7f3a91c2-0000-4000-8000-000000000679";

async function mockGuestCheckout(page: Page, state: ChannelState) {
  await page.route("**/api/delivery/methods", (route) =>
    route.fulfill({
      json: {
        data: {
          // The same offer `checkout-delivery.spec.ts` drives; pickup is
          // picked below, so no Nova Poshta directory is needed.
          methods: ["NOVA_POSHTA", "PICKUP", "COURIER", "OTHER"],
          courier: { price: "150.00", freeFrom: "2000.00", cityName: "Київ" },
          pickupPoints: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              name: "Магазин на Хрещатику",
              city: "Київ",
              address: "вул. Хрещатик, 22",
              phone: "+380441234567",
              workingHours: "Пн–Сб 10:00–20:00",
              mapUrl: null,
            },
          ],
          paymentMatrix: {
            NOVA_POSHTA: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
            PICKUP: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
            COURIER: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
            OTHER: ["ON_DELIVERY"],
          },
        },
      },
    }),
  );
  await page.route("**/api/orders", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return route.fulfill({
      status: 201,
      json: {
        data: {
          id: GUEST_ORDER_ID,
          userId: null,
          status: "PENDING",
          paymentStatus: "PENDING",
          paymentMethod: "ON_DELIVERY",
          deliveryMethod: "PICKUP",
          total: "12181.00",
          items: [],
          guestAccessToken: GUEST_TOKEN,
        },
      },
    });
  });
  const reads = { count: 0 };
  await page.route(
    `**/api/orders/guest/${GUEST_TOKEN}/notifications/telegram`,
    (route) => {
      reads.count += 1;
      return route.fulfill({ json: statusBody(state) });
    },
  );
  await page.route(
    `**/api/orders/guest/${GUEST_TOKEN}/notifications/telegram/link`,
    (route) => route.fulfill({ json: linkBody() }),
  );
  return reads;
}

async function placeGuestOrder(page: Page) {
  await addSeededProductToCart(page);
  await page.goto("/checkout");
  const main = page.getByRole("main");
  await waitForHydration(main.locator("#checkout-email"));
  await main
    .getByRole("radiogroup", { name: "Спосіб доставки" })
    .getByRole("radio", { name: /Самовивіз з магазину/ })
    .check();
  await main.locator("#checkout-email").fill("olena@example.com");
  await main.getByLabel("Ім'я", { exact: true }).fill("Олена");
  await main.getByLabel("Прізвище", { exact: true }).fill("Коваль");
  await main.locator("#checkout-phone").fill("+380501234567");
  await main.getByRole("button", { name: "Далі" }).click();
  await expect(
    main.getByRole("heading", { name: "Перевірте деталі замовлення" }),
  ).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
  await main.getByRole("checkbox", { name: "Я приймаю умови" }).check();
  await main.getByRole("button", { name: "Підтвердити замовлення" }).click();
  await expect(
    main.getByRole("heading", { name: "Замовлення прийнято!" }),
  ).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
}

for (const [size, viewport] of VIEWPORTS) {
  test.describe(`TASK-679 guest success at ${size}`, () => {
    test.use({ viewport });

    test(`off → wait → on (${size})`, async ({ page }) => {
      const state: ChannelState = { available: true, connected: false };
      await mockGuestCheckout(page, state);
      await placeGuestOrder(page);

      const card = page.getByTestId("checkout-telegram-card");
      await expect(card).toContainText("#7F3A91C2", {
        timeout: RENDER_TIMEOUT_MS,
      });
      await shot(page, `guest-success-off-page-${size}`);
      await cardShot(page, card, `guest-success-off-card-${size}`);

      await card.getByRole("button", { name: "Підключити Telegram" }).click();
      await expect(
        card.getByRole("link", { name: /Відкрити Telegram/ }),
      ).toHaveAttribute("href", DEEP_LINK, { timeout: RENDER_TIMEOUT_MS });
      await shot(page, `guest-success-wait-page-${size}`);
      await cardShot(page, card, `guest-success-wait-card-${size}`);

      state.connected = true;
      state.label = "@olena";
      await card.getByRole("button", { name: "Я натиснув «Старт»" }).click();
      await expect(card.getByRole("status")).toContainText(
        "Повідомлення про це замовлення прийдуть у Telegram і на olena@example.com",
        { timeout: RENDER_TIMEOUT_MS },
      );
      await shot(page, `guest-success-on-page-${size}`);
      await cardShot(page, card, `guest-success-on-card-${size}`);
    });

    test(`bot unavailable — no card (${size})`, async ({ page }) => {
      const state: ChannelState = { available: false, connected: false };
      const reads = await mockGuestCheckout(page, state);
      await placeGuestOrder(page);

      // The status WAS asked (the token arrived) and answered «unavailable».
      await expect.poll(() => reads.count).toBeGreaterThan(0);
      await page.waitForTimeout(500);
      await expect(page.getByTestId("checkout-telegram-card")).toHaveCount(0);
      await shot(page, `guest-success-na-page-${size}`);
    });
  });
}
