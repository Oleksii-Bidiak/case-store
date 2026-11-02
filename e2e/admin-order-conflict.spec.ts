import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import type { Browser } from "@playwright/test";
import { test, expect, type Page } from "./fixtures/test";
import { loginAsAdmin } from "./fixtures/admin-session";
import { waitForHydration } from "./fixtures/hydration";
import { E2E_PRODUCT_SLUG, moneyColumns } from "./fixtures/seed-e2e";

/**
 * TASK-1972 (AD-ORD-67, AD-ORD-105) — two operators on one order card.
 *
 * Tab A starts typing, tab B saves first. A's «Зберегти» is refused 409 by the
 * real lock; what only the real stack proves is the rest of the loop: A is shown
 * B's saved version next to the draft, a repeat save sends nothing until A has
 * reviewed it, and only then does A's save go out — over B's version, not the
 * one A started from. Before the fix the second click overwrote B silently.
 *
 * The jsdom halves (`order-details-form.test.tsx`, `order-address-form.test.tsx`,
 * `use-stale-draft-review.test.ts`) pin each branch; this spec pins the wiring.
 *
 * Its own order, created and removed here: the seeded orders are shared by the
 * filter and permission specs, and this one rewrites the notes and the address.
 * Labels are `dict.*` strings, hardcoded — the app is not importable from here.
 */

const ORDER_ID = randomUUID();
const CUSTOMER_EMAIL = `e2e-conflict-${ORDER_ID.slice(0, 8)}@test.com`;
const TOTAL = "499.00";

const T = {
  notes: "Внутрішні примітки",
  save: "Зберегти",
  addressEdit: "Змінити адресу",
  addressSave: "Зберегти адресу",
  city: "Місто",
  takeTheirs: "Взяти версію колеги",
  keepMine: "Переглянув(-ла) — зберегти мою чернетку",
  saveHint: "Щоб зберегти, спершу перегляньте зміни колеги вище.",
} as const;

function withPrisma<T>(fn: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return fn(prisma).finally(() => prisma.$disconnect());
}

/** Wait for this tab's PATCH of the order and return its status. */
async function patchStatus(page: Page, click: () => Promise<void>) {
  const answered = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url().endsWith(`/api/admin/orders/${ORDER_ID}`),
  );
  await click();
  return (await answered).status();
}

test.describe("admin order card — two operators, one order (TASK-1972)", () => {
  test.beforeAll(async () => {
    await withPrisma(async (prisma) => {
      const product = await prisma.product.findUniqueOrThrow({
        where: { slug: E2E_PRODUCT_SLUG },
        select: { id: true },
      });
      const customer = await prisma.user.create({
        data: {
          email: CUSTOMER_EMAIL,
          firstName: "Conflict",
          lastName: "Buyer",
          isActive: true,
        },
      });
      await prisma.order.create({
        data: {
          id: ORDER_ID,
          userId: customer.id,
          status: "PENDING",
          ...moneyColumns({ total: TOTAL, status: "PENDING" }),
          paymentMethod: "ON_DELIVERY",
          subtotal: TOTAL,
          total: TOTAL,
          shippingAddress: {
            firstName: "Olena",
            lastName: "Shevchenko",
            phone: "+380501234567",
            city: "Kyiv",
            address1: "Khreshchatyk 1",
          },
          items: {
            create: [{ productId: product.id, quantity: 1, price: TOTAL }],
          },
        },
      });
    });
  });

  test.afterAll(async () => {
    await withPrisma(async (prisma) => {
      await prisma.order.deleteMany({ where: { id: ORDER_ID } });
      await prisma.user.deleteMany({ where: { email: CUSTOMER_EMAIL } });
    });
  });

  /** Tab A is the test's page; tab B is a second, separately signed-in context. */
  async function twoTabs(
    page: Page,
    open: (tab: Page) => Promise<void>,
    browser: Browser,
    options: { baseURL?: string; extraHTTPHeaders?: Record<string, string> },
  ) {
    const contextB = await browser.newContext(options);
    const tabB = await contextB.newPage();
    await loginAsAdmin(page);
    await loginAsAdmin(tabB);
    await page.goto(`/orders/${ORDER_ID}`);
    await tabB.goto(`/orders/${ORDER_ID}`);
    await open(page);
    await open(tabB);
    return { tabA: page, tabB, close: () => contextB.close() };
  }

  test("internal notes: the colleague's note is shown before the draft can overwrite it", async ({
    page,
    browser,
    baseURL,
    extraHTTPHeaders,
  }) => {
    test.setTimeout(120_000);
    const notesOf = (tab: Page) => tab.getByRole("textbox", { name: T.notes });
    const { tabA, tabB, close } = await twoTabs(
      page,
      (tab) =>
        waitForHydration(tab.locator("form").filter({ has: notesOf(tab) })),
      browser,
      { baseURL, extraHTTPHeaders },
    );
    try {
      const saveOf = (tab: Page) =>
        tab
          .locator("form")
          .filter({ has: notesOf(tab) })
          .getByRole("button", { name: T.save, exact: true });

      // A starts typing; B saves its own note meanwhile.
      await notesOf(tabA).fill("Нотатка вкладки А");
      await notesOf(tabB).fill("Нотатка колеги");
      expect(await patchStatus(tabB, () => saveOf(tabB).click())).toBe(200);

      // A's save is refused, and A now SEES B's note next to the draft.
      expect(await patchStatus(tabA, () => saveOf(tabA).click())).toBe(409);
      const panel = tabA.locator('[data-slot="stale-draft-panel"]');
      await expect(panel.getByText("Нотатка колеги")).toBeVisible();
      await expect(notesOf(tabA)).toHaveValue("Нотатка вкладки А");
      await expect(saveOf(tabA)).toBeDisabled();
      await expect(tabA.getByText(T.saveHint)).toBeVisible();

      // Reviewed → the draft goes out over B's version, and is accepted.
      await panel.getByRole("button", { name: T.keepMine }).click();
      expect(await patchStatus(tabA, () => saveOf(tabA).click())).toBe(200);
      await expect(panel).toBeHidden();
    } finally {
      await close();
    }
  });

  test("address: «Взяти версію колеги» keeps the colleague's city", async ({
    page,
    browser,
    baseURL,
    extraHTTPHeaders,
  }) => {
    test.setTimeout(120_000);
    const cityOf = (tab: Page) => tab.getByRole("textbox", { name: T.city });
    const { tabA, tabB, close } = await twoTabs(
      page,
      async (tab) => {
        const edit = tab.getByRole("button", { name: T.addressEdit });
        await waitForHydration(edit);
        await edit.click();
        await expect(cityOf(tab)).toBeVisible();
      },
      browser,
      { baseURL, extraHTTPHeaders },
    );
    try {
      const saveOf = (tab: Page) =>
        tab.getByRole("button", { name: T.addressSave, exact: true });

      await cityOf(tabA).fill("Lviv");
      await cityOf(tabB).fill("Odesa");
      expect(await patchStatus(tabB, () => saveOf(tabB).click())).toBe(200);

      expect(await patchStatus(tabA, () => saveOf(tabA).click())).toBe(409);
      const row = tabA
        .locator('[data-slot="stale-draft-panel"]')
        .getByRole("group", { name: T.city });
      await expect(row.getByText("Odesa")).toBeVisible();
      await expect(saveOf(tabA)).toBeDisabled();

      await row.getByRole("button", { name: T.takeTheirs }).click();
      await expect(cityOf(tabA)).toHaveValue("Odesa");
    } finally {
      await close();
    }
  });
});
