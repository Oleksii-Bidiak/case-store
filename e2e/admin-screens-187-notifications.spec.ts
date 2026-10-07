import * as fs from "node:fs";
import * as path from "node:path";
import type { Route } from "@playwright/test";
import { test, expect, type Page } from "./fixtures/test";
import { loginAsAdmin } from "./fixtures/admin-session";
import { waitForHydration } from "./fixtures/hydration";

/**
 * TASK-676 screenshot harness — /settings/notifications. Evidence for the
 * visual verifier, not a regression gate.
 *
 * SKIPPED unless `SCREENS_187` is set. Writes
 * `.screens-187/676/<name>-page-{1440,390}.png`, one pair per state, to be read
 * next to the `SettingsNotifications.dc.html` mockup shots
 * (`.screens-187/mockups/admin-dn7-*.png`, ДН-7.1…7.12).
 *
 *   SCREENS_187=1 npx playwright test e2e/admin-screens-187-notifications.spec.ts
 *
 * The stand has no bot token, so every channel state is forced in the browser:
 * `page.route` answers the four notification routes (GET channel, POST link,
 * POST test, DELETE binding) with the mockup's data. The session is a real
 * admin login; «без права» rewrites the `/auth/me/permissions` answer.
 */

const ENABLED = !!process.env.SCREENS_187;
const OUT_DIR = path.resolve(__dirname, "../.screens-187/676");
const RENDER_TIMEOUT_MS = 30_000;

const VIEWPORTS = [
  ["1440", { width: 1440, height: 900 }],
  ["390", { width: 390, height: 844 }],
] as const;

test.skip(!ENABLED, "set SCREENS_187=1 to capture TASK-676 shots");

const CHANNEL_URL = "**/api/admin/notifications/telegram";

const PRIVATE_CHAT = {
  id: "11111111-1111-4111-8111-111111111111",
  label: "Олексій Б.",
  kind: "PRIVATE",
  createdAt: "2026-10-01T09:00:00.000Z",
  connectedBy: {
    id: "u-1",
    email: "owner@store.com",
    firstName: "Олексій",
    lastName: "Бідяк",
  },
};
const GROUP_CHAT = {
  id: "22222222-2222-4222-8222-222222222222",
  label: "Магазин — замовлення",
  kind: "GROUP",
  createdAt: "2026-10-02T09:00:00.000Z",
  connectedBy: {
    id: "u-2",
    email: "olena@store.com",
    firstName: "Олена",
    lastName: "Коваль",
  },
};

type Channel = Record<string, unknown>;

/** Checked «today», 09:40 Kyiv — whatever day the harness runs. */
function checkedAtToday(): string {
  const now = new Date();
  now.setUTCHours(6, 40, 0, 0);
  return now.toISOString();
}

function okChannel(bindings: unknown[]): Channel {
  return {
    state: "ok",
    botUsername: "casestore_bot",
    checkedAt: checkedAtToday(),
    bindings,
  };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

/** Answer the channel GET with whatever `current()` returns at that moment. */
async function stubChannel(page: Page, current: () => Channel): Promise<void> {
  await page.route(CHANNEL_URL, (route) =>
    route.request().method() === "GET"
      ? json(route, { data: current() })
      : route.fallback(),
  );
}

async function stubLink(page: Page): Promise<void> {
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  await page.route(`${CHANNEL_URL}/link`, (route) =>
    json(route, {
      data: {
        deepLink: "https://t.me/casestore_bot?start=a1b2c3d4e5f6",
        groupDeepLink: "https://t.me/casestore_bot?startgroup=a1b2c3d4e5f6",
        expiresAt,
      },
    }),
  );
}

function note(message: string): void {
  console.log(`[screens-187-676] ${message}`);
}

async function shot(page: Page, name: string, width: string): Promise<void> {
  await page.screenshot({
    path: path.join(OUT_DIR, `${name}-page-${width}.png`),
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  });
  note(`${name}-page-${width}.png written`);
}

async function openPage(page: Page): Promise<void> {
  await page.goto("/settings/notifications");
  await expect(
    page.getByRole("heading", { level: 2, name: "Сповіщення" }),
  ).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
}

async function waitForCards(page: Page): Promise<void> {
  const card = page.getByRole("region", { name: "Telegram-бот магазину" });
  await expect(card).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
  await waitForHydration(card);
}

test.describe("TASK-676 screens", () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  });

  for (const [width, viewport] of VIEWPORTS) {
    test.describe(`${width}px`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize(viewport);
        await loginAsAdmin(page);
      });

      test("ДН-7.1/7.2 · bot ok, two chats", async ({ page }) => {
        await stubChannel(page, () => okChannel([PRIVATE_CHAT, GROUP_CHAT]));
        await openPage(page);
        await waitForCards(page);
        await shot(page, "dn7-1-ok", width);
      });

      test("ДН-7.3/7.6 · connect dialog, my Telegram", async ({ page }) => {
        await stubChannel(page, () => okChannel([PRIVATE_CHAT, GROUP_CHAT]));
        await stubLink(page);
        await openPage(page);
        await waitForCards(page);
        await page.getByRole("button", { name: "Підключити Telegram" }).click();
        const dialog = page.getByRole("dialog", {
          name: "Підключити Telegram",
        });
        await expect(
          dialog.getByRole("link", { name: /Відкрити Telegram/ }),
        ).toBeVisible();
        await shot(page, "dn7-3-connect-private", width);
      });

      test("ДН-7.4 · connect dialog, work group", async ({ page }) => {
        await stubChannel(page, () => okChannel([PRIVATE_CHAT, GROUP_CHAT]));
        await stubLink(page);
        await openPage(page);
        await waitForCards(page);
        await page.getByRole("button", { name: "Підключити Telegram" }).click();
        const dialog = page.getByRole("dialog", {
          name: "Підключити Telegram",
        });
        await dialog.getByRole("tab", { name: "Робоча група" }).click();
        await expect(
          dialog.getByRole("link", { name: /Додати бота в групу/ }),
        ).toBeVisible();
        await shot(page, "dn7-4-connect-group", width);
      });

      test("ДН-7.5 · connect dialog, connected", async ({ page }) => {
        let started = false;
        await stubChannel(page, () =>
          okChannel(started ? [GROUP_CHAT, PRIVATE_CHAT] : [GROUP_CHAT]),
        );
        await stubLink(page);
        await openPage(page);
        await waitForCards(page);
        await page.getByRole("button", { name: "Підключити Telegram" }).click();
        const dialog = page.getByRole("dialog", {
          name: "Підключити Telegram",
        });
        await expect(
          dialog.getByRole("link", { name: /Відкрити Telegram/ }),
        ).toBeVisible();
        started = true;
        await expect(
          dialog.getByText("Підключено: Олексій Б. (особистий чат)"),
        ).toBeVisible({ timeout: 10_000 });
        await shot(page, "dn7-5-connect-done", width);
      });

      test("ДН-7.7 · test sent, one chat failed", async ({ page }) => {
        await stubChannel(page, () => okChannel([PRIVATE_CHAT, GROUP_CHAT]));
        await page.route(`${CHANNEL_URL}/test`, (route) =>
          json(route, {
            data: {
              results: [
                { bindingId: PRIVATE_CHAT.id, ok: true },
                {
                  bindingId: GROUP_CHAT.id,
                  ok: false,
                  error: "бота видалено з групи",
                },
              ],
            },
          }),
        );
        await openPage(page);
        await waitForCards(page);
        await page.getByRole("button", { name: "Надіслати тестове" }).click();
        await expect(page.getByTestId("telegram-test-summary")).toBeVisible();
        await shot(page, "dn7-7-test-results", width);
      });

      test("ДН-7.8 · disconnect a group", async ({ page }) => {
        await stubChannel(page, () => okChannel([PRIVATE_CHAT, GROUP_CHAT]));
        await openPage(page);
        await waitForCards(page);
        await page
          .getByRole("button", { name: "Відключити «Магазин — замовлення»" })
          .click();
        await expect(page.getByRole("alertdialog")).toBeVisible();
        await shot(page, "dn7-8-disconnect", width);
      });

      test("ДН-7.9 · bot ok, no chats", async ({ page }) => {
        await stubChannel(page, () => okChannel([]));
        await openPage(page);
        await waitForCards(page);
        await shot(page, "dn7-9-empty", width);
      });

      test("ДН-7.10 · bot failed", async ({ page }) => {
        await stubChannel(page, () => ({
          state: "failed",
          reason: "Telegram getMe failed (401): Unauthorized",
          checkedAt: checkedAtToday(),
          bindings: [PRIVATE_CHAT, GROUP_CHAT],
        }));
        await openPage(page);
        await waitForCards(page);
        await shot(page, "dn7-10-failed", width);
      });

      test("ДН-7.11 · bot unconfigured", async ({ page }) => {
        await stubChannel(page, () => ({
          state: "unconfigured",
          bindings: [],
        }));
        await openPage(page);
        await waitForCards(page);
        await shot(page, "dn7-11-unconfigured", width);
      });

      test("ДН-7.12 · manager without settings:notifications", async ({
        page,
      }) => {
        await page.route("**/api/auth/me/permissions", (route) =>
          json(route, {
            data: {
              role: "MANAGER",
              isOwner: false,
              isAdmin: false,
              permissions: [
                "orders:read",
                "returns:read",
                "messages:read",
                "customers:read",
              ],
              entries: [],
            },
          }),
        );
        await openPage(page);
        await expect(page.getByText("Немає доступу до сповіщень")).toBeVisible({
          timeout: RENDER_TIMEOUT_MS,
        });
        await shot(page, "dn7-12-no-access", width);
      });
    });
  }
});
