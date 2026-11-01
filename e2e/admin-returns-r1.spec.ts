import { randomUUID } from "node:crypto";
import {
  request as playwrightRequest,
  type APIRequestContext,
} from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as argon2 from "argon2";
import { test, expect, type Page } from "./fixtures/test";
import { loginAsAdmin } from "./fixtures/admin-session";
import { waitForHydration } from "./fixtures/hydration";
import { API_PORT, CLIENT_ORIGIN } from "./fixtures/ports";
import {
  E2E_ADMIN_EMAIL,
  E2E_PRODUCT_SLUG,
  E2E_SOLD_OUT_PRODUCT_SLUG,
  clearMoneyEntries,
  moneyColumns,
} from "./fixtures/seed-e2e";

/**
 * Returns wave R1 — the happy path across both surfaces (TASK-1963, TASK-1961,
 * TASK-1962).
 *
 * jsdom pins each piece on its own (the create dialog, the decide form, the
 * customer history) and the API e2e pins the contract; this proves they meet:
 *
 *   1. the operator files a PARTIAL return from the order card — two of three
 *      units of one line, «Заміна» as what the buyer wants, a comment — and the
 *      order's own status does not move;
 *   2. the return shows up in the order's «Повернення» section with its line;
 *   3. «Відмова» without a reason is stopped in the form, nothing is sent;
 *   4. with a reason it is saved: «Відхилено», the reason and the author;
 *   5. the customer sees the refusal and its reason on their order page, and
 *      the customer API carries no operator notes.
 *
 * Arrange is direct Prisma (like admin-wave-f): a throwaway customer and a
 * DELIVERED order with two lines, both unique per run, so the seeded e2e
 * customer's order counts (account-orders.spec) are never disturbed. The
 * operator notes are written straight to the row — the point is that the
 * customer projection drops them, not how they got there. Everything created
 * here is removed in afterAll.
 *
 * Strings are the dictionaries' (`apps/store-admin/src/shared/config/
 * dictionary.ts` → `dict.returns`, `apps/store-client/.../dictionary.ts` →
 * `dict.returnRequest`), hardcoded because the apps are not importable from
 * the root-level suite.
 */

const RUN = `${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
const CUSTOMER_EMAIL = `e2e-returns-r1-${RUN}@test.com`;
const CUSTOMER_PASSWORD = "E2eReturnsR1!";
const ORDER_ID = randomUUID();
const ORDER_REF = ORDER_ID.slice(0, 8).toUpperCase();

const OPERATOR_COMMENT = `Покупець подзвонив — не той колір (${RUN})`;
const REFUSAL_REASON = `Сліди падіння на корпусі — не гарантійний випадок (${RUN})`;
const OPERATOR_NOTES = `Внутрішнє: клієнт сварився (${RUN})`;

/** Admin labels — `dict.returns` / `dict.orders`. */
const A = {
  orderHeading: `Замовлення #${ORDER_REF}`,
  orderDelivered: "Доставлено",
  createAction: "Оформити повернення",
  increase: (name: string) => `Більше: ${name}`,
  quantity: (name: string) => `Кількість до повернення: ${name}`,
  outcomeGroup: "Чого хоче покупець",
  replacement: "Заміна",
  comment: "Коментар оператора",
  submit: "Створити заявку",
  created: "Заявку створено. Статус замовлення не змінено.",
  openReturn: /^Відкрити заявку #/,
  close: "Закрити",
  returnsSection: "Повернення",
  itemsAria: (number: string) => `Позиції заявки ${number}`,
  line: (name: string, quantity: number) => `${name} × ${quantity}`,
  statusRequested: "Запит",
  statusRejected: "Відхилено",
  createdBy: (name: string) => `Заявку створив оператор ${name}`,
  decisionNone: "Рішення ще не ухвалено.",
  decisionCard: "Рішення",
  reject: "Відмова",
  decideReason: "Причина для покупця",
  decideSubmit: "Зберегти рішення",
  reasonRequired: "Вкажіть причину — її побачить покупець.",
  decideSuccess: "Рішення збережено.",
  changeDecision: "Змінити рішення…",
} as const;

/** Storefront labels — `dict.returnRequest`. */
const S = {
  historyTitle: "Заяви на повернення",
  itemTitle: (ref: string) => new RegExp(`^Заява #${ref} від `),
  wanted: "Чого хотіли",
  replacement: "Заміна",
  reject: "Відмова",
} as const;

function withPrisma<T>(fn: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return fn(prisma).finally(() => prisma.$disconnect());
}

/** Same rule as `displayName` in `return.entity.ts`: first + last, else email. */
function displayName(user: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const name = [user.firstName, user.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return name || user.email;
}

interface Fixture {
  productName: string;
  otherProductName: string;
  adminName: string;
}

/** The storefront sign-in, as `account-orders.spec.ts` drives it. */
async function signInOnStorefront(page: Page): Promise<void> {
  const submitName = { name: /^увійти$/i };
  const form = page
    .getByRole("main")
    .locator("form")
    .filter({ has: page.getByRole("button", submitName) });
  await waitForHydration(form);
  await page.getByLabel(/(пошта|email)/i).fill(CUSTOMER_EMAIL);
  await page.getByLabel(/(пароль|password)/i).fill(CUSTOMER_PASSWORD);
  await form.getByRole("button", submitName).click();
}

test.describe("returns wave R1 — file, refuse, read (TASK-1963/1961/1962)", () => {
  let fixture: Fixture;

  test.beforeAll(async () => {
    fixture = await withPrisma(async (prisma) => {
      const [product, otherProduct] = await Promise.all([
        prisma.product.findUniqueOrThrow({
          where: { slug: E2E_PRODUCT_SLUG },
          select: { id: true, name: true },
        }),
        prisma.product.findUniqueOrThrow({
          where: { slug: E2E_SOLD_OUT_PRODUCT_SLUG },
          select: { id: true, name: true },
        }),
      ]);
      const admin = await prisma.user.findUniqueOrThrow({
        where: { email: E2E_ADMIN_EMAIL },
        select: { firstName: true, lastName: true, email: true },
      });

      const customer = await prisma.user.create({
        data: {
          email: CUSTOMER_EMAIL,
          passwordHash: await argon2.hash(CUSTOMER_PASSWORD),
          firstName: "Returns",
          lastName: "Buyer",
          isActive: true,
        },
      });

      // Three of one line (so two of three is a PARTIAL return) and one of
      // another (so "only the picked line" is something the screen can get
      // wrong). DELIVERED: one of the two statuses a return is accepted on.
      const deliveredAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      await prisma.order.create({
        data: {
          id: ORDER_ID,
          userId: customer.id,
          status: "DELIVERED",
          // R2: paid = a journal entry, the columns derived from it.
          ...moneyColumns({
            total: "1896.00",
            status: "DELIVERED",
            paidKop: 189_600,
          }),
          paymentMethod: "ON_DELIVERY",
          paidAt: deliveredAt,
          subtotal: "1896.00",
          total: "1896.00",
          createdAt: deliveredAt,
          items: {
            create: [
              { productId: product.id, quantity: 3, price: "499.00" },
              { productId: otherProduct.id, quantity: 1, price: "399.00" },
            ],
          },
          moneyEntries: {
            create: [
              {
                direction: "IN",
                kind: "COD_NOVA_POSHTA",
                amountKop: 189_600,
                occurredAt: deliveredAt,
              },
            ],
          },
        },
      });

      return {
        productName: product.name,
        otherProductName: otherProduct.name,
        adminName: displayName(admin),
      };
    });
  });

  test.afterAll(async () => {
    await withPrisma(async (prisma) => {
      // Journal → return → order → customer: each one Restricts the next.
      // Return items and decision events cascade with the return.
      await clearMoneyEntries(prisma, [ORDER_ID]);
      await prisma.return.deleteMany({ where: { orderId: ORDER_ID } });
      await prisma.order.deleteMany({ where: { id: ORDER_ID } });
      await prisma.user.deleteMany({ where: { email: CUSTOMER_EMAIL } });
    });
  });

  test("the operator files a partial return, refuses it with a reason, and the customer reads why", async ({
    page,
    browser,
    extraHTTPHeaders,
  }) => {
    test.setTimeout(150_000);
    const { productName, otherProductName, adminName } = fixture;

    // --- 1. File the return from the order card ------------------------------
    await loginAsAdmin(page);
    await page.goto(`/orders/${ORDER_ID}`);
    await expect(
      page.getByRole("heading", { name: A.orderHeading }),
    ).toBeVisible();

    // Exact: a paid, delivered order's «Оплата» block also offers «Оформити
    // повернення на позиції» (R2).
    await page
      .getByRole("button", { name: A.createAction, exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const increase = dialog.getByRole("button", {
      name: A.increase(productName),
      exact: true,
    });
    await increase.click();
    await increase.click();
    await expect(
      dialog.getByRole("spinbutton", {
        name: A.quantity(productName),
        exact: true,
      }),
    ).toHaveValue("2");
    await expect(
      dialog.getByRole("spinbutton", {
        name: A.quantity(otherProductName),
        exact: true,
      }),
    ).toHaveValue("0");

    await dialog
      .getByRole("radiogroup", { name: A.outcomeGroup })
      .getByRole("radio", { name: A.replacement, exact: true })
      .click();
    await dialog.getByLabel(A.comment).fill(OPERATOR_COMMENT);
    await dialog.getByRole("button", { name: A.submit }).click();

    await expect(dialog.getByText(A.created)).toBeVisible();
    const openReturn = dialog.getByRole("link", { name: A.openReturn });
    const href = await openReturn.getAttribute("href");
    const returnId = href?.match(/\/returns\/([0-9a-f-]{36})$/)?.[1];
    expect(returnId, `unexpected return link: ${href}`).toBeTruthy();
    const returnNumber = `#${returnId!.slice(0, 8).toUpperCase()}`;

    // What reached the database: exactly the picked units, the buyer's wish,
    // the comment, the operator door — and the order's status untouched.
    const filed = await withPrisma((prisma) =>
      prisma.return.findUniqueOrThrow({
        where: { id: returnId! },
        include: {
          items: { include: { orderItem: { select: { productId: true } } } },
          order: { select: { status: true } },
        },
      }),
    );
    expect(filed.status).toBe("REQUESTED");
    expect(filed.requestedOutcome).toBe("REPLACEMENT");
    expect(filed.channel).toBe("OPERATOR");
    expect(filed.reason).toBe(OPERATOR_COMMENT);
    expect(filed.items.map((item) => item.quantity)).toEqual([2]);
    expect(filed.order.status).toBe("DELIVERED");

    // The footer «Закрити», not the corner ✕ (also named «Закрити» for screen readers).
    await dialog
      .getByRole("button", { name: A.close })
      .and(dialog.locator('[data-slot="button"]'))
      .click();
    await expect(dialog).toBeHidden();

    // --- 2. The order card: status unchanged, the return listed ---------------
    // The header badge (the status control may repeat the word in hidden
    // markup, hence the visible filter); the DB check above is the hard proof.
    await expect(
      page
        .getByText(A.orderDelivered, { exact: true })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();

    const returnsSection = page.locator("section").filter({
      has: page.getByRole("heading", { name: A.returnsSection, exact: true }),
    });
    const row = returnsSection
      .getByRole("listitem")
      .filter({ has: page.getByRole("link", { name: returnNumber }) });
    await expect(row).toHaveCount(1);
    await expect(
      row.getByText(A.statusRequested, { exact: true }),
    ).toBeVisible();
    await expect(row.getByText(A.createdBy(adminName))).toBeVisible();
    const lines = row.getByRole("list", { name: A.itemsAria(returnNumber) });
    await expect(lines.getByRole("listitem")).toHaveText([
      A.line(productName, 2),
    ]);
    await expect(row.getByText(A.decisionNone)).toBeVisible();

    // --- 3. «Відмова» without a reason is stopped before the API -------------
    const decisionPosts: string[] = [];
    page.on("request", (req) => {
      if (
        req.method() === "POST" &&
        req.url().includes(`/api/admin/returns/${returnId}/decision`)
      ) {
        decisionPosts.push(req.url());
      }
    });

    await row.getByRole("link", { name: returnNumber }).click();
    await expect(page).toHaveURL(`/returns/${returnId}`);

    const card = page.getByRole("region", {
      name: A.decisionCard,
      exact: true,
    });
    await card.getByRole("radio", { name: A.reject, exact: true }).click();
    const reason = card.getByLabel(A.decideReason);
    await expect(reason).toHaveValue("");
    await card.getByRole("button", { name: A.decideSubmit }).click();

    await expect(card.getByText(A.reasonRequired)).toBeVisible();
    await expect(reason).toHaveAttribute("aria-invalid", "true");
    expect(decisionPosts).toHaveLength(0);
    const untouched = await withPrisma((prisma) =>
      prisma.return.findUniqueOrThrow({
        where: { id: returnId! },
        select: { status: true, decision: true },
      }),
    );
    expect(untouched).toEqual({ status: "REQUESTED", decision: null });

    // --- 4. With a reason it is saved, with its author -----------------------
    await reason.fill(REFUSAL_REASON);
    await card.getByRole("button", { name: A.decideSubmit }).click();

    await expect(page.getByText(A.decideSuccess).first()).toBeVisible();
    expect(decisionPosts).toHaveLength(1);
    await expect(
      card.getByRole("button", { name: A.changeDecision }),
    ).toBeVisible();
    await expect(card.getByText(A.reject, { exact: true })).toBeVisible();
    await expect(card.getByText(REFUSAL_REASON)).toBeVisible();
    await expect(card.getByText(adminName, { exact: true })).toBeVisible();

    const header = page
      .getByRole("main")
      .locator("header")
      .filter({ has: page.getByRole("heading", { name: returnNumber }) });
    await expect(
      header.getByText(A.statusRejected, { exact: true }),
    ).toBeVisible();

    // The refusal is a decision on the RETURN; the order stays delivered.
    // Operator notes are written now so step 5 can prove the customer never
    // gets them.
    const decided = await withPrisma(async (prisma) => {
      await prisma.return.update({
        where: { id: returnId! },
        data: { operatorNotes: OPERATOR_NOTES },
      });
      return prisma.return.findUniqueOrThrow({
        where: { id: returnId! },
        select: {
          status: true,
          decision: true,
          decisionReason: true,
          order: { select: { status: true } },
        },
      });
    });
    expect(decided).toEqual({
      status: "REJECTED",
      decision: "REJECT",
      decisionReason: REFUSAL_REASON,
      order: { status: "DELIVERED" },
    });

    // --- 5. The customer side --------------------------------------------------
    // A context of its own: the admin's refresh cookie and the customer's would
    // share one cookie jar on localhost (cookies ignore the port).
    const customerContext = await browser.newContext({
      baseURL: CLIENT_ORIGIN,
      extraHTTPHeaders,
    });
    let api: APIRequestContext | null = null;
    try {
      // 5a. The API: the reason is there, the operator's notes are not.
      api = await playwrightRequest.newContext({
        baseURL: `http://localhost:${API_PORT}`,
        extraHTTPHeaders,
      });
      const login = await api.post("/api/auth/login", {
        data: { email: CUSTOMER_EMAIL, password: CUSTOMER_PASSWORD },
      });
      expect(login.status()).toBe(200);
      const { data: tokens } = (await login.json()) as {
        data: { accessToken: string };
      };
      const returnsResponse = await api.get(`/api/orders/${ORDER_ID}/returns`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      expect(returnsResponse.status()).toBe(200);
      const raw = await returnsResponse.text();
      const { data: customerReturns } = JSON.parse(raw) as {
        data: Array<Record<string, unknown>>;
      };
      expect(customerReturns).toHaveLength(1);
      expect(customerReturns[0]).toMatchObject({
        id: returnId,
        status: "REJECTED",
        decision: "REJECT",
        decisionReason: REFUSAL_REASON,
        requestedOutcome: "REPLACEMENT",
      });
      expect(customerReturns[0]).not.toHaveProperty("operatorNotes");
      expect(raw).not.toContain(OPERATOR_NOTES);

      // 5b. The storefront order page.
      const customerPage = await customerContext.newPage();
      await customerPage.goto(`/account/orders/${ORDER_ID}`);
      await expect(customerPage).toHaveURL(/\/login\?redirect=/);
      await signInOnStorefront(customerPage);
      await expect(customerPage).toHaveURL(`/account/orders/${ORDER_ID}`);

      const history = customerPage.getByTestId("order-return-history");
      await expect(
        history.getByRole("heading", { name: S.historyTitle }),
      ).toBeVisible();
      const item = history.getByRole("article", {
        name: S.itemTitle(returnId!.slice(0, 8).toUpperCase()),
      });
      await expect(item).toHaveCount(1);
      await expect(item.getByRole("listitem")).toHaveText([
        `${productName} × 2`,
      ]);
      await expect(item).toContainText(S.wanted);
      await expect(
        item.getByText(S.replacement, { exact: true }),
      ).toBeVisible();
      await expect(item.getByText(S.reject, { exact: true })).toBeVisible();
      await expect(item.getByText(REFUSAL_REASON)).toBeVisible();
      await expect(history).not.toContainText(OPERATOR_NOTES);
      await expect(history).not.toContainText(adminName);
    } finally {
      await api?.dispose();
      await customerContext.close();
    }
  });
});
