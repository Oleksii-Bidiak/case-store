import { test, expect } from "./fixtures/test";
import {
  E2E_MANAGER_RO_EMAIL,
  E2E_MANAGER_RO_PASSWORD,
} from "./fixtures/seed-e2e";
import { loginAsAdmin, loginAsStaff } from "./fixtures/admin-session";

/**
 * TASK-676 — /settings/notifications on the real API.
 *
 * The e2e stand runs without `TELEGRAM_BOT_TOKEN`, so what this proves is plan
 * 187's first constraint end to end: a channel that is not configured SAYS so —
 * the badge, the explanation, and both actions disabled with the reason under
 * them — instead of offering a «Підключити» that would lead nowhere. The happy
 * path (a working bot, chats, the connect dialog) needs Telegram and is covered
 * by the jsdom suite and the SCREENS_187 harness.
 *
 * Labels are `dict.notificationSettings.*` / `dict.nav.*` from the admin
 * dictionary, hardcoded because the app is not importable from this suite.
 */

const PAGE_URL = "/settings/notifications";
const NAV_NOTIFICATIONS = "Сповіщення";
const HEADING = "Сповіщення";
const BOT_CARD = "Telegram-бот магазину";
const UNCONFIGURED_BADGE = "Не налаштований";
const UNCONFIGURED_TITLE = "Бота ще не налаштовано";
const CONNECT = "Підключити Telegram";
const SEND_TEST = "Надіслати тестове";
const LOCKED_HINT =
  "Поки бот не працює, підключати чати й надсилати тестове немає сенсу — кнопки вимкнено.";
const NO_ACCESS = "Немає доступу до сповіщень";

test.describe("admin notification settings (TASK-676)", () => {
  test("the owner reaches it from the menu and sees the bot honestly unconfigured", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    const channelAnswered = page.waitForResponse(
      (res) =>
        res.url().includes("/api/admin/notifications/telegram") &&
        res.request().method() === "GET",
    );
    await page
      .getByRole("link", { name: NAV_NOTIFICATIONS, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${PAGE_URL}$`));
    expect((await channelAnswered).ok()).toBe(true);

    await expect(
      page.getByRole("heading", { level: 2, name: HEADING }),
    ).toBeVisible();
    const botCard = page.getByRole("region", { name: BOT_CARD });
    await expect(botCard.getByText(UNCONFIGURED_BADGE)).toBeVisible();
    await expect(botCard.getByText(UNCONFIGURED_TITLE)).toBeVisible();

    await expect(page.getByRole("button", { name: CONNECT })).toBeDisabled();
    await expect(page.getByRole("button", { name: SEND_TEST })).toBeDisabled();
    await expect(page.getByText(LOCKED_HINT)).toBeVisible();
  });

  test("a manager without settings:notifications gets the refusal and no menu entry", async ({
    page,
  }) => {
    const channelRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/admin/notifications/")) {
        channelRequests.push(request.url());
      }
    });

    await loginAsStaff(page, {
      email: E2E_MANAGER_RO_EMAIL,
      password: E2E_MANAGER_RO_PASSWORD,
    });
    await expect(
      page.getByRole("link", { name: NAV_NOTIFICATIONS, exact: true }),
    ).toHaveCount(0);

    await page.goto(PAGE_URL);
    await expect(
      page.getByRole("heading", { level: 2, name: HEADING }),
    ).toBeVisible();
    await expect(
      page.getByRole("alert").filter({ hasText: NO_ACCESS }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: CONNECT })).toHaveCount(0);
    // The gate keeps the guaranteed-403 reads from going out at all.
    expect(channelRequests).toEqual([]);
  });
});
