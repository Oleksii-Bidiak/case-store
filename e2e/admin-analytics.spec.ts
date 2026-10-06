import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/test";
import {
  E2E_MANAGER_ANALYTICS_EMAIL,
  E2E_MANAGER_ANALYTICS_PASSWORD,
  E2E_MANAGER_RO_EMAIL,
  E2E_MANAGER_RO_PASSWORD,
} from "./fixtures/seed-e2e";
import { loginAsAdmin, loginAsStaff } from "./fixtures/admin-session";

/**
 * TASK-692 — /analytics, end to end: one period for all reports kept in the
 * URL, the custom range, CSV, and the money split by `analytics:revenue`.
 *
 * jsdom covers each block against MSW fixtures; this proves the real API and
 * the real session agree with them — above all that a manager without the
 * revenue right gets no money from the SERVER (no request for the sales report,
 * no `revenue` key in the catalogue answer), not merely a screen that hides it.
 *
 * Resilient to an empty test DB: no paid orders are needed — «Продажі» renders
 * with zeros, and an empty catalogue report still draws its header (the
 * «Виторг» column then follows the session's right).
 *
 * Strings are the admin dictionary's (`dict.analytics`, `dict.nav`),
 * hardcoded because the app is not importable from the root-level suite — same
 * convention as `admin-staff.spec.ts`.
 */

const PAGE_URL = "/analytics";

const NAV_REPORTS = "Звіти";
const SALES = "Продажі";
const CATALOGUE = "Категорії й бренди";
const REGISTRATIONS = "Реєстрації";
const PRESET_7D = "7 днів";
const PRESET_CUSTOM = "Довільно…";
const CUSTOM_TITLE = "Довільний період";
const CUSTOM_FROM = "З";
const CUSTOM_TO = "По";
const CUSTOM_APPLY = "Показати";
const REVENUE_COLUMN = "Виторг";
const SALES_CSV = `Завантажити CSV: ${SALES}`;
const REVENUE_LOCKED =
  "Суми в гривнях не показуються: для них потрібне право «Виторг і фінансові показники».";
const FORBIDDEN = "У вас немає доступу до звітів.";

const SALES_REQUEST = /\/api\/admin\/analytics\/reports\/sales/;
const CATEGORIES_REQUEST = /\/api\/admin\/analytics\/reports\/categories/;

/** Today in Kyiv as `YYYY-MM-DD` — the API's calendar, not the runner's. */
function kyivToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** `YYYY-MM-DD` ± days, calendar arithmetic. */
function shiftDay(day: string, delta: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + delta))
    .toISOString()
    .slice(0, 10);
}

const periodLabel = (page: Page) => page.locator('[data-slot="period-label"]');

/** A GET that reached the API (not the CORS preflight before it). */
const isGet =
  (url: RegExp) =>
  (response: { url(): string; request(): { method(): string } }) =>
    url.test(response.url()) && response.request().method() === "GET";

test.describe("/analytics (TASK-692)", () => {
  test("the owner: reports with money, a period kept in the URL, a custom range and CSV", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    const salesAnswered = page.waitForResponse(isGet(SALES_REQUEST));
    await page.goto(PAGE_URL);

    await expect(page.getByRole("region", { name: SALES })).toBeVisible();
    expect((await salesAnswered).ok()).toBe(true);
    await expect(
      page
        .getByRole("region", { name: CATALOGUE })
        .getByRole("columnheader", { name: REVENUE_COLUMN }),
    ).toBeVisible();

    // A preset is written to the URL and survives a reload.
    await page.getByRole("button", { name: PRESET_7D, exact: true }).click();
    await expect(page).toHaveURL(/[?&]preset=7d(&|$)/);
    await page.reload();
    await expect(
      page.getByRole("button", { name: PRESET_7D, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(periodLabel(page)).toContainText(`· ${PRESET_7D}`);

    // A custom range of ten Kyiv days ending today — a length no preset has,
    // so the label can only be the server's reading of THIS range.
    const to = kyivToday();
    const from = shiftDay(to, -9);
    await page.getByRole("button", { name: PRESET_CUSTOM }).click();
    const dialog = page.getByRole("dialog", { name: CUSTOM_TITLE });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(CUSTOM_FROM, { exact: true }).fill(from);
    await dialog.getByLabel(CUSTOM_TO, { exact: true }).fill(to);
    await dialog.getByRole("button", { name: CUSTOM_APPLY }).click();

    await expect(page).toHaveURL(
      new RegExp(`[?&]preset=custom&from=${from}&to=${to}(&|$)`),
    );
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: PRESET_CUSTOM }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(periodLabel(page)).toContainText("· 10 днів");

    // CSV: the file is named after the report and the days, and carries the
    // UTF-8 BOM Excel needs to read Cyrillic.
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: SALES_CSV }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(
      /^sales-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/,
    );
    const saved = await download.path();
    expect(saved).toBeTruthy();
    const bytes = await readFile(saved as string);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  test("a manager with analytics:read only: no money from the server, and the screen says why", async ({
    page,
  }) => {
    const requested: string[] = [];
    page.on("request", (request) => requested.push(request.url()));

    await loginAsStaff(page, {
      email: E2E_MANAGER_ANALYTICS_EMAIL,
      password: E2E_MANAGER_ANALYTICS_PASSWORD,
    });
    await expect(page.getByRole("link", { name: NAV_REPORTS })).toBeVisible();

    const categoriesAnswered = page.waitForResponse(isGet(CATEGORIES_REQUEST));
    await page.goto(PAGE_URL);

    await expect(page.getByText(REVENUE_LOCKED)).toBeVisible();
    await expect(
      page.getByRole("region", { name: REGISTRATIONS }),
    ).toBeVisible();

    // The API cut the money: the key is ABSENT from every row, not null.
    const categories = await categoriesAnswered;
    expect(categories.ok()).toBe(true);
    const body = (await categories.json()) as {
      data: { rows: Array<Record<string, unknown>> };
    };
    for (const row of body.data.rows) {
      expect(row).not.toHaveProperty("revenue");
    }

    // Let every report finish asking before counting what was asked.
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("region", { name: SALES })).toHaveCount(0);
    await expect(
      page
        .getByRole("region", { name: CATALOGUE })
        .getByRole("columnheader", { name: REVENUE_COLUMN }),
    ).toHaveCount(0);
    expect(requested.filter((url) => SALES_REQUEST.test(url))).toEqual([]);
  });

  test("a manager without analytics:read is refused, and has no «Звіти» in the menu", async ({
    page,
  }) => {
    await loginAsStaff(page, {
      email: E2E_MANAGER_RO_EMAIL,
      password: E2E_MANAGER_RO_PASSWORD,
    });

    await page.goto(PAGE_URL);
    await expect(page.getByText(FORBIDDEN)).toBeVisible();
    await expect(page.getByRole("link", { name: NAV_REPORTS })).toHaveCount(0);
    await expect(page.getByRole("region", { name: SALES })).toHaveCount(0);
  });
});
