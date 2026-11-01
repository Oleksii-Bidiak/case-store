import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import type { Locator } from "@playwright/test";
import { test, expect, type Page } from "./fixtures/test";
import { loginAsAdmin } from "./fixtures/admin-session";
import {
  E2E_PRODUCT_SLUG,
  E2E_SOLD_OUT_PRODUCT_SLUG,
  clearMoneyEntries,
  moneyColumns,
} from "./fixtures/seed-e2e";

/**
 * R2 "payment from one place" — the operator's whole money path on one order
 * (TASK-1967, TASK-2046, TASK-2047):
 *
 *   1. a DELIVERED cash-on-delivery order owes its total («Борг»); the operator
 *      records the Nova Poshta money with «Записати надходження» → «Оплачено»;
 *   2. files a return of one line from the order card, decides «Гроші» and
 *      marks the goods received on the return page;
 *   3. pays the return out with «Виплатити» in two parts — after the first the
 *      card still says «Винні покупцю» (and nothing says «Борг»), after the
 *      second the return is «Гроші повернуто» by itself;
 *   4. reverses («Сторнувати») one payout with a reason — «Винні покупцю»
 *      comes back and the return goes back to «Товар отримано».
 *
 * jsdom pins each dialog (`order-payment-block.test.tsx`,
 * `return-money-card.test.tsx`) and the API e2e pins the ledger rules; this is
 * the one run that proves a payout on the return page moves the order's money
 * and the return's status together, in a real browser, against the real API.
 *
 * Arrange is direct Prisma (like admin-returns-r1): a throwaway customer and a
 * DELIVERED order with two lines and an empty journal, unique per run, removed
 * in afterAll.
 *
 * Strings are the admin dictionary's (`dict.orderMoney`, `dict.returnMoney`,
 * `dict.returns`), hardcoded because the app is not importable from the
 * root-level suite.
 */

const RUN = `${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
const CUSTOMER_EMAIL = `e2e-money-${RUN}@test.com`;
const ORDER_ID = randomUUID();
const TOTAL = "898.00"; // 499 + 399
const REVERSAL_REASON = `Касир видав не ту суму (${RUN})`;

const A = {
  orderHeading: `Замовлення #${ORDER_ID.slice(0, 8)}`,
  block: "Оплата",
  summary: "Підсумок оплати",
  receiptAction: "Записати надходження",
  receiptTitle: "Записати надходження",
  receiptNp: "Гроші від НП отримано",
  amount: "Сума, ₴",
  receiptToast: "Надходження записано",
  paid: "Оплачено",
  createReturn: "Оформити повернення",
  increase: (name: string) => `Більше: ${name}`,
  createSubmit: "Створити заявку",
  openReturn: /^Відкрити заявку #/,
  decisionCard: "Рішення",
  decisionRefund: "Гроші",
  decideSubmit: "Зберегти рішення",
  decideSuccess: "Рішення збережено.",
  markReceived: "Товар отримано",
  statusApproved: "Схвалено",
  statusReceived: "Товар отримано",
  statusRefunded: "Гроші повернуто",
  returnMoney: "Гроші за заявкою",
  payout: "Виплатити",
  payoutTitle: "Виплатити за заявкою",
  cash: "Готівкою на точці",
  payoutToast: "Виплату записано",
  reverseTitle: "Сторнувати запис",
  reason: "Причина",
  reverseSubmit: "Сторнувати",
  reverseToast: "Запис сторновано",
  reversedChip: "Сторновано",
} as const;

function withPrisma<T>(fn: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return fn(prisma).finally(() => prisma.$disconnect());
}

/** The return's own status badge in its page header. */
function returnStatus(page: Page, returnNumber: string): Locator {
  return page
    .getByRole("main")
    .locator("header")
    .filter({ has: page.getByRole("heading", { name: returnNumber }) })
    .locator('[data-slot="badge"]');
}

/** «Виплатити» → the amount → «Виплатити X ₴», cash at the point. */
async function payOut(
  page: Page,
  card: Locator,
  amount: string,
  prefilled: string,
) {
  await card.getByRole("button", { name: A.payout, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: A.payoutTitle });
  await expect(dialog.getByRole("radio", { name: A.cash })).toBeChecked();
  // Prefilled with what is still due on the return.
  await expect(dialog.getByLabel(A.amount)).toHaveValue(prefilled);
  await dialog.getByLabel(A.amount).fill(amount);
  const answered = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/money\/out$/.test(response.url()),
  );
  await dialog
    .getByRole("button", { name: new RegExp(`^Виплатити ${amount}\\s₴$`) })
    .click();
  // A refusal (e.g. 409 ORDER_STALE) also closes the dialog — name it here.
  const response = await answered;
  expect(response.ok(), await response.text()).toBe(true);
  await expect(dialog).toBeHidden();
  await expect(page.getByText(A.payoutToast).first()).toBeVisible();
}

test.describe("order money — receipt, return payouts, reversal (R2)", () => {
  let productName = "";

  test.beforeAll(async () => {
    productName = await withPrisma(async (prisma) => {
      const [product, otherProduct] = await Promise.all([
        prisma.product.findUniqueOrThrow({
          where: { slug: E2E_PRODUCT_SLUG },
          select: { id: true, name: true },
        }),
        prisma.product.findUniqueOrThrow({
          where: { slug: E2E_SOLD_OUT_PRODUCT_SLUG },
          select: { id: true },
        }),
      ]);
      const customer = await prisma.user.create({
        data: {
          email: CUSTOMER_EMAIL,
          firstName: "Money",
          lastName: "Buyer",
          isActive: true,
        },
      });
      // Nova Poshta cash on delivery, delivered, nothing recorded yet: the
      // whole total is a debt until the NP money is written down.
      const deliveredAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      await prisma.order.create({
        data: {
          id: ORDER_ID,
          userId: customer.id,
          status: "DELIVERED",
          ...moneyColumns({ total: TOTAL, status: "DELIVERED" }),
          paymentMethod: "ON_DELIVERY",
          deliveryMethod: "NOVA_POSHTA",
          subtotal: TOTAL,
          total: TOTAL,
          createdAt: deliveredAt,
          items: {
            create: [
              { productId: product.id, quantity: 1, price: "499.00" },
              { productId: otherProduct.id, quantity: 1, price: "399.00" },
            ],
          },
        },
      });
      return product.name;
    });
  });

  test.afterAll(async () => {
    await withPrisma(async (prisma) => {
      // Journal → return → order → customer: each one Restricts the next.
      await clearMoneyEntries(prisma, [ORDER_ID]);
      await prisma.return.deleteMany({ where: { orderId: ORDER_ID } });
      await prisma.order.deleteMany({ where: { id: ORDER_ID } });
      await prisma.user.deleteMany({ where: { email: CUSTOMER_EMAIL } });
    });
  });

  test("the operator records the NP money, pays a return out in two parts and reverses one", async ({
    page,
  }) => {
    test.setTimeout(150_000);

    // --- 1. The receipt on the order card ----------------------------------
    await loginAsAdmin(page);
    await page.goto(`/orders/${ORDER_ID}`);
    await expect(
      page.getByRole("heading", { name: A.orderHeading }),
    ).toBeVisible();
    const block = page.getByRole("region", { name: A.block, exact: true });
    const summary = block.getByRole("group", { name: A.summary });
    await expect(summary).toContainText(/Борг 898 ₴/);

    await block.getByRole("button", { name: A.receiptAction }).click();
    const receipt = page.getByRole("dialog", { name: A.receiptTitle });
    await receipt.getByRole("radio", { name: A.receiptNp }).click();
    await expect(receipt.getByLabel(A.amount)).toHaveValue("898");
    await receipt.getByRole("button", { name: /^Записати 898\s₴$/ }).click();

    await expect(page.getByText(A.receiptToast)).toBeVisible();
    await expect(block.getByText(A.paid, { exact: true })).toBeVisible();
    await expect(summary).toContainText(/Сплачено 898 ₴ з 898 ₴/);
    await expect(summary).not.toContainText("Борг");
    await expect(block.getByTestId("money-entry")).toHaveCount(1);

    // --- 2. A return of one line, decided «Гроші», goods received -----------
    await page
      .getByRole("button", { name: A.createReturn, exact: true })
      .click();
    const create = page.getByRole("dialog");
    await create
      .getByRole("button", { name: A.increase(productName), exact: true })
      .click();
    await create.getByRole("button", { name: A.createSubmit }).click();
    const href = await create
      .getByRole("link", { name: A.openReturn })
      .getAttribute("href");
    const returnId = href?.match(/\/returns\/([0-9a-f-]{36})$/)?.[1];
    expect(returnId, `unexpected return link: ${href}`).toBeTruthy();
    const returnNumber = `#${returnId!.slice(0, 8).toUpperCase()}`;

    await page.goto(`/returns/${returnId}`);
    const status = returnStatus(page, returnNumber);
    const decision = page.getByRole("region", {
      name: A.decisionCard,
      exact: true,
    });
    await decision
      .getByRole("radio", { name: A.decisionRefund, exact: true })
      .click();
    await decision.getByRole("button", { name: A.decideSubmit }).click();
    await expect(page.getByText(A.decideSuccess).first()).toBeVisible();
    await expect(status).toHaveText(A.statusApproved);

    await page
      .getByRole("button", { name: A.markReceived, exact: true })
      .click();
    await expect(status).toHaveText(A.statusReceived);

    // No reload: the decide / resolve forms refetch `GET …/money` (TASK-2350),
    // so the first «Виплатити» carries the fresh `expectedUpdatedAt`.

    // --- 3. Two payouts ------------------------------------------------------
    const card = page.getByRole("region", { name: A.returnMoney, exact: true });
    await expect(card.getByTestId("return-credit")).toHaveText(/^499 ₴$/);
    await expect(card).toContainText(/Винні покупцю 499 ₴/);

    await payOut(page, card, "200", "499");
    await expect(card).toContainText(/Винні покупцю 299 ₴/);
    // The shop owes the customer; nobody owes the shop.
    await expect(page.getByRole("main").getByText(/Борг/)).toHaveCount(0);
    await expect(status).toHaveText(A.statusReceived);

    await payOut(page, card, "299", "299");
    await expect(status).toHaveText(A.statusRefunded);
    await expect(card).not.toContainText("Винні покупцю");
    const payouts = card.getByTestId("return-payout");
    await expect(payouts).toHaveCount(2);

    // --- 4. Reverse the first payout ----------------------------------------
    const first = payouts.filter({ hasText: /200 ₴/ });
    await first
      .getByRole("button", {
        name: /^Сторнувати «Повернення готівкою на точці, 200 ₴/,
      })
      .click();
    const reverse = page.getByRole("dialog", { name: A.reverseTitle });
    await reverse.getByLabel(A.reason).fill(REVERSAL_REASON);
    await reverse
      .getByRole("button", { name: A.reverseSubmit, exact: true })
      .click();

    await expect(page.getByText(A.reverseToast).first()).toBeVisible();
    await expect(
      first.getByText(A.reversedChip, { exact: true }),
    ).toBeVisible();
    await expect(card).toContainText(/Винні покупцю 200 ₴/);
    await expect(status).toHaveText(A.statusReceived);

    // What reached the database: the return back to RECEIVED, the order owing
    // the customer 200 ₴ (balance −20000), its payment partly refunded.
    const after = await withPrisma((prisma) =>
      prisma.order.findUniqueOrThrow({
        where: { id: ORDER_ID },
        select: {
          status: true,
          paymentStatus: true,
          paidKop: true,
          refundedKop: true,
          returnCreditKop: true,
          balanceKop: true,
          returns: { select: { id: true, status: true } },
        },
      }),
    );
    expect(after).toEqual({
      status: "DELIVERED",
      paymentStatus: "PARTIALLY_REFUNDED",
      paidKop: 89_800,
      refundedKop: 29_900,
      returnCreditKop: 49_900,
      balanceKop: -20_000,
      returns: [{ id: returnId, status: "RECEIVED" }],
    });

    // The order card says the same, and never «Борг».
    await page.goto(`/orders/${ORDER_ID}`);
    await expect(summary).toContainText(/Винні покупцю 200 ₴/);
    await expect(summary).not.toContainText("Борг");
  });
});
