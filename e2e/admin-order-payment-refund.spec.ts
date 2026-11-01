import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { test, expect, type Page } from "./fixtures/test";
import { loginAsAdmin } from "./fixtures/admin-session";
import { ADMIN_ORIGIN } from "./fixtures/ports";
import {
  E2E_PRODUCT_SLUG,
  clearMoneyEntries,
  moneyColumns,
} from "./fixtures/seed-e2e";

/**
 * R2 "payment from one place" (TASK-2047, TASK-951) — money back WITHOUT a
 * return, from the order's «Оплата» block, on a cancelled order that was paid
 * by card. Replaces the TASK-371 spec of the per-attempt «Повернути кошти».
 *
 * jsdom covers each branch of the dialog (`order-payment-block.test.tsx`) and
 * the API contract is pinned by the store-api e2e suite; this proves the two
 * meet in a real browser:
 *
 *   1. «Через LiqPay» — offered because the journal ties the paid money to the
 *      LiqPay attempt; the typed amount and the attempt are what leave the
 *      browser. The POST is intercepted (answered with the order's money as
 *      the controller would), because the stand has no real LiqPay merchant:
 *      nothing reaches the provider and nothing is written.
 *   2. «Готівкою на точці» — the real write: the journal gets the payout, the
 *      summary and badge say «Кошти повернено», the header «Скасовано · кошти
 *      повернено», and the button is gone (nothing left to give back).
 *
 * Arrange is direct Prisma (like admin-returns-r1): a throwaway customer and
 * two CANCELLED ONLINE orders, each with a SUCCEEDED attempt and its
 * LIQPAY_PAYMENT journal entry, columns derived by the API's own rules
 * (`moneyColumns`). Unique per run, removed in afterAll.
 *
 * Strings are the admin dictionary's (`dict.orderMoney`, `dict.orderStatus`),
 * hardcoded because the app is not importable from the root-level suite.
 */

const RUN = `${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
const CUSTOMER_EMAIL = `e2e-money-refund-${RUN}@test.com`;
const TOTAL = "1299.00";
const TOTAL_KOP = 129_900;

interface PaidOrder {
  orderId: string;
  paymentId: string;
}
const LIQPAY_ORDER: PaidOrder = {
  orderId: randomUUID(),
  paymentId: randomUUID(),
};
const CASH_ORDER: PaidOrder = {
  orderId: randomUUID(),
  paymentId: randomUUID(),
};

const M = {
  block: "Оплата",
  summary: "Підсумок оплати",
  journal: "Журнал оплат",
  payoutAction: "Повернути гроші",
  payoutTitle: "Повернути гроші покупцеві",
  cash: "Готівкою на точці",
  liqpay: "Через LiqPay",
  amount: "Сума, ₴",
  liqpayToast:
    "Запит на повернення надіслано в LiqPay — запис чекає підтвердження.",
  cashToast: "Виплату записано",
  badgeRefunded: "Кошти повернено",
  cancelledRefunded: "Скасовано · кошти повернено",
} as const;

function withPrisma<T>(fn: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return fn(prisma).finally(() => prisma.$disconnect());
}

const moneyUrl = (orderId: string) => `/api/admin/orders/${orderId}/money`;

async function openOrder(page: Page, orderId: string) {
  await page.goto(`/orders/${orderId}`);
  await expect(
    page.getByRole("heading", { name: `Замовлення #${orderId.slice(0, 8)}` }),
  ).toBeVisible();
  return page.getByRole("region", { name: M.block, exact: true });
}

test.describe("order money — refund a cancelled paid order (R2, TASK-2047)", () => {
  test.beforeAll(async () => {
    await withPrisma(async (prisma) => {
      const product = await prisma.product.findUniqueOrThrow({
        where: { slug: E2E_PRODUCT_SLUG },
        select: { id: true },
      });
      const customer = await prisma.user.create({
        data: {
          email: CUSTOMER_EMAIL,
          firstName: "Refund",
          lastName: "Buyer",
          isActive: true,
        },
      });
      const paidAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
      for (const [index, fixture] of [LIQPAY_ORDER, CASH_ORDER].entries()) {
        await prisma.order.create({
          data: {
            id: fixture.orderId,
            userId: customer.id,
            status: "CANCELLED",
            ...moneyColumns({
              total: TOTAL,
              status: "CANCELLED",
              paidKop: TOTAL_KOP,
            }),
            paymentMethod: "ONLINE",
            paidAt,
            subtotal: TOTAL,
            total: TOTAL,
            createdAt: paidAt,
            items: {
              create: [{ productId: product.id, quantity: 1, price: TOTAL }],
            },
          },
        });
        await prisma.payment.create({
          data: {
            id: fixture.paymentId,
            orderId: fixture.orderId,
            provider: "liqpay",
            providerPaymentId: `e2e-liqpay-r2-${RUN}-${index}`,
            amount: TOTAL,
            currency: "UAH",
            status: "SUCCEEDED",
            settledAt: paidAt,
          },
        });
        await prisma.orderMoneyEntry.create({
          data: {
            orderId: fixture.orderId,
            direction: "IN",
            kind: "LIQPAY_PAYMENT",
            amountKop: TOTAL_KOP,
            paymentId: fixture.paymentId,
            providerRef: "success",
            occurredAt: paidAt,
          },
        });
      }
    });
  });

  test.afterAll(async () => {
    await withPrisma(async (prisma) => {
      const orderIds = [LIQPAY_ORDER.orderId, CASH_ORDER.orderId];
      // Journal → attempts → orders → customer: each one Restricts the next.
      await clearMoneyEntries(prisma, orderIds);
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      await prisma.user.deleteMany({ where: { email: CUSTOMER_EMAIL } });
    });
  });

  test("«Через LiqPay» sends the typed amount against the paid attempt", async ({
    page,
  }) => {
    const { orderId, paymentId } = LIQPAY_ORDER;
    await loginAsAdmin(page);

    // The order's money as the server sends it — what the intercepted payout
    // answers with, exactly as the controller answers a REQUESTED refund.
    const moneyLoaded = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url().endsWith(moneyUrl(orderId)),
    );
    const payoutBodies: unknown[] = [];
    await page.route(`**${moneyUrl(orderId)}/out`, async (route) => {
      payoutBodies.push(route.request().postDataJSON());
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": ADMIN_ORIGIN,
          "access-control-allow-credentials": "true",
        },
        body: JSON.stringify(await (await moneyLoaded).json()),
      });
    });

    const block = await openOrder(page, orderId);
    await moneyLoaded;
    await expect(block.getByRole("group", { name: M.summary })).toContainText(
      /Сплачено 1\s299 ₴ з 1\s299 ₴/,
    );
    // A cancelled order owes nothing; the money kept on it is owed back.
    await expect(block).toContainText(/Винні покупцю 1\s299 ₴/);
    await expect(block.getByTestId("money-entry")).toHaveCount(1);

    await block.getByRole("button", { name: M.payoutAction }).click();
    const dialog = page.getByRole("dialog", { name: M.payoutTitle });
    await dialog.getByRole("radio", { name: M.liqpay }).click();
    await dialog.getByLabel(M.amount).fill("499,50");
    expect(payoutBodies).toHaveLength(0);
    await dialog.getByRole("button", { name: /^Повернути 499,5\s₴/ }).click();

    await expect(page.getByText(M.liqpayToast)).toBeVisible();
    // The comma typed by the operator leaves the browser as whole kopecks,
    // with the attempt the refund is made from.
    expect(payoutBodies).toHaveLength(1);
    expect(payoutBodies[0]).toMatchObject({
      kind: "LIQPAY_REFUND",
      amountKop: 49_950,
      paymentId,
    });

    // Intercepted: nothing was written for real.
    const out = await withPrisma((prisma) =>
      prisma.orderMoneyEntry.count({ where: { orderId, direction: "OUT" } }),
    );
    expect(out).toBe(0);
  });

  test("«Готівкою на точці» writes the payout and the order reads as refunded", async ({
    page,
  }) => {
    const { orderId } = CASH_ORDER;
    await loginAsAdmin(page);
    const block = await openOrder(page, orderId);

    await block.getByRole("button", { name: M.payoutAction }).click();
    const dialog = page.getByRole("dialog", { name: M.payoutTitle });
    await expect(dialog.getByRole("radio", { name: M.cash })).toBeChecked();
    // Prefilled with everything that may go back.
    await expect(dialog.getByLabel(M.amount)).toHaveValue("1299");
    await dialog.getByRole("button", { name: /^Повернути 1\s299\s₴$/ }).click();

    await expect(page.getByText(M.cashToast)).toBeVisible();
    await expect(block.getByTestId("money-entry")).toHaveCount(2);
    await expect(block.getByRole("group", { name: M.summary })).toContainText(
      /Повернуто 1\s299 ₴/,
    );
    await expect(
      block.getByText(M.badgeRefunded, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(M.cancelledRefunded).filter({ visible: true }).first(),
    ).toBeVisible();
    // Nothing is held any more — nothing to give back.
    await expect(
      block.getByRole("button", { name: M.payoutAction }),
    ).toHaveCount(0);

    const order = await withPrisma((prisma) =>
      prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        select: {
          status: true,
          paymentStatus: true,
          paidKop: true,
          refundedKop: true,
          balanceKop: true,
        },
      }),
    );
    expect(order).toEqual({
      status: "CANCELLED",
      paymentStatus: "REFUNDED",
      paidKop: TOTAL_KOP,
      refundedKop: TOTAL_KOP,
      balanceKop: 0,
    });
  });
});
