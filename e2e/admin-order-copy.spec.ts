import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { test, expect } from "./fixtures/test";
import { loginAsAdmin } from "./fixtures/admin-session";
import { waitForHydration } from "./fixtures/hydration";
import { E2E_PRODUCT_SLUG, moneyColumns } from "./fixtures/seed-e2e";

/**
 * TASK-2048 «Створити копію» — the happy path on the real stack.
 *
 * A live order is copied with «Скасувати #старе — замінено» ticked: the copy
 * form opens prefilled from the original, «Створити замовлення» goes out with
 * `copyOfOrderId` + `cancelOriginal`, and the original's card now reads
 * «Скасовано» with «Замінено на #нове». The jsdom halves
 * (`order-create-form.copy.test.tsx`, `order-detail-view.test.tsx`) pin each
 * branch; `order-copy.int-spec.ts` pins the one transaction.
 *
 * Its own order, created and removed here. Labels are `dict.*` strings,
 * hardcoded — the app is not importable from here.
 */

const ORDER_ID = randomUUID();
const NUMBER = `#${ORDER_ID.slice(0, 8).toUpperCase()}`;
const TOTAL = "499.00";

const T = {
  copy: "Створити копію",
  heading: `Копія замовлення ${NUMBER}`,
  cancelOriginal: `Скасувати ${NUMBER} — замінено цією копією`,
  submit: "Створити замовлення",
  created: "Замовлення створено",
  replacedBy: "Замінено на",
  cancelled: "Скасовано",
} as const;

function withPrisma<R>(fn: (prisma: PrismaClient) => Promise<R>): Promise<R> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return fn(prisma).finally(() => prisma.$disconnect());
}

test.describe("admin — «Створити копію» (TASK-2048)", () => {
  test.beforeAll(async () => {
    await withPrisma(async (prisma) => {
      const product = await prisma.product.findUniqueOrThrow({
        where: { slug: E2E_PRODUCT_SLUG },
        select: { id: true },
      });
      await prisma.order.create({
        data: {
          id: ORDER_ID,
          guestName: "Олена Коваль",
          guestPhone: "380501234567",
          status: "PENDING",
          ...moneyColumns({ total: TOTAL, status: "PENDING" }),
          paymentMethod: "ON_DELIVERY",
          subtotal: TOTAL,
          total: TOTAL,
          deliveryMethod: "OTHER",
          shippingAddress: {
            deliveryMethod: "OTHER",
            firstName: "Олена",
            lastName: "Коваль",
            phone: "+380501234567",
            city: "Київ",
            address1: "Хрещатик, 1",
          },
          items: {
            create: [{ productId: product.id, quantity: 1, price: TOTAL }],
          },
        },
      });
      // The reservation the original holds, as a placed order would.
      await prisma.product.update({
        where: { id: product.id },
        data: { stock: { decrement: 1 } },
      });
    });
  });

  test.afterAll(async () => {
    await withPrisma(async (prisma) => {
      const orders = { OR: [{ id: ORDER_ID }, { copiedFromId: ORDER_ID }] };
      const ids = (
        await prisma.order.findMany({ where: orders, select: { id: true } })
      ).map((order) => order.id);
      // Stock: the cancel gave the original's unit back, the copy took it.
      const copyLines = await prisma.orderItem.findMany({
        where: { order: { copiedFromId: ORDER_ID } },
        select: { productId: true, quantity: true },
      });
      for (const line of copyLines) {
        await prisma.product.update({
          where: { id: line.productId },
          data: { stock: { increment: line.quantity } },
        });
      }
      await prisma.orderMoneyEntry.deleteMany({
        where: { orderId: { in: ids } },
      });
      await prisma.orderStatusHistory.deleteMany({
        where: { orderId: { in: ids } },
      });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
      await prisma.order.deleteMany({ where: { copiedFromId: ORDER_ID } });
      await prisma.order.deleteMany({ where: { id: ORDER_ID } });
    });
  });

  test("copies a live order and replaces it in one step", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsAdmin(page);
    await page.goto(`/orders/${ORDER_ID}`);

    const copy = page.getByRole("link", { name: T.copy });
    await waitForHydration(copy);
    await copy.click();
    await expect(page).toHaveURL(new RegExp(`copyOf=${ORDER_ID}`));

    await expect(page.getByText(T.heading)).toBeVisible();
    const cancel = page.getByRole("checkbox", { name: T.cancelOriginal });
    await expect(cancel).toBeChecked();

    const posted = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith("/api/admin/orders"),
    );
    await page.getByRole("button", { name: T.submit }).click();
    const response = await posted;
    expect(response.status()).toBe(201);
    expect(response.request().postDataJSON()).toMatchObject({
      copyOfOrderId: ORDER_ID,
      cancelOriginal: true,
    });
    await expect(page.getByRole("heading", { name: T.created })).toBeVisible();

    await page.goto(`/orders/${ORDER_ID}`);
    await expect(page.getByText(T.replacedBy)).toBeVisible();
    await expect(page.getByText(T.cancelled).first()).toBeVisible();
  });
});
