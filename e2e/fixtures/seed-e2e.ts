import * as path from "node:path";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as argon2 from "argon2";

// Playwright's globalSetup runs from the repo root, where DATABASE_URL is not
// set — load the API workspace's .env so PrismaClient can connect (the same DB
// the webServer-booted API uses).
loadEnv({ path: path.resolve(__dirname, "../../apps/store-api/.env") });

/**
 * E2E seed (Playwright `globalSetup`). Inserts a deterministic fixture set the
 * specs rely on, namespaced with an `e2e` prefix to avoid colliding with manual
 * dev data. Idempotent: upserts so repeated runs don't duplicate rows.
 *
 * Fixture contract (keep in sync with the specs):
 *   - product slug:   `test-product` (+ sold-out `test-product-sold-out`)
 *   - user login:     `e2e@test.com` / `E2ePassword1!`
 *   - admin login:    `e2e-admin@test.com` / `E2eAdminPassword1!`
 *   - read-only mgr:  `e2e-manager-ro@test.com` / `E2eManagerRo1!` — MANAGER
 *                     holding ONLY `orders:read` (TASK-715)
 *   - orders:        one PROCESSING + one PENDING (ids below)
 *   - paid order:    one ONLINE + CONFIRMED + PAID order with a SUCCEEDED LiqPay
 *                    attempt of 1299.00 (TASK-371, the payment card)
 */
export const E2E_PRODUCT_SLUG = "test-product";
/** Category both catalogue fixtures are filed in (TASK-830). */
export const E2E_CATEGORY_SLUG = "e2e-category";
/** Same category as `test-product`, stock 0 (TASK-830). */
export const E2E_SOLD_OUT_PRODUCT_SLUG = "test-product-sold-out";
export const E2E_SOLD_OUT_PRODUCT_NAME = "E2E Sold Out Product";
export const E2E_USER_EMAIL = "e2e@test.com";
export const E2E_USER_PASSWORD = "E2ePassword1!";

/** Staff account for the admin-panel specs — role ADMIN, i.e. the shop owner. */
export const E2E_ADMIN_EMAIL = "e2e-admin@test.com";
export const E2E_ADMIN_PASSWORD = "E2eAdminPassword1!";

/**
 * A MANAGER who may READ orders and nothing else (TASK-715).
 *
 * The admin above holds every permission, so it cannot show what a narrower
 * session is spared. This one exists for the specs asserting that a control is
 * ABSENT without its right — the order card of someone who may look but not
 * change. Its grant set is reset to exactly `orders:read` on every run, so a
 * row added by hand on the test DB cannot quietly widen it.
 */
export const E2E_MANAGER_RO_EMAIL = "e2e-manager-ro@test.com";
export const E2E_MANAGER_RO_PASSWORD = "E2eManagerRo1!";
const E2E_MANAGER_RO_PERMISSIONS = ["orders:read"];

/**
 * Order fixtures for the admin order-filter specs (TASK-405).
 *
 * Real v4 UUIDs — version nibble `4`, variant `8` — because the API validates
 * `@IsUUID(4)` on the order id path params these rows are reachable through, and
 * the demo-run triage found non-v4 ids sitting in a seed for exactly that reason.
 *
 * The admin table prints `id.slice(0, 8)`, so the two ids MUST differ inside
 * their first eight characters: that prefix is how a spec tells one row from the
 * other on screen.
 */
export const E2E_ORDER_PROCESSING_ID = "e2e40501-0000-4000-8000-000000000001";
export const E2E_ORDER_PENDING_ID = "e2e40502-0000-4000-8000-000000000002";
const E2E_ORDER_PROCESSING_ITEM_ID = "e2e40511-0000-4000-8000-000000000011";
const E2E_ORDER_PENDING_ITEM_ID = "e2e40512-0000-4000-8000-000000000012";

/**
 * An ONLINE order paid by card, with one SUCCEEDED LiqPay attempt (TASK-371) —
 * the minimum the payment card needs to offer «Повернути кошти». CONFIRMED, so
 * it never shows up in the PENDING/PROCESSING filter specs above. The refund
 * spec intercepts the POST in the browser, so this row is never refunded for
 * real and stays SUCCEEDED run after run; the upsert resets it anyway.
 */
export const E2E_ORDER_ONLINE_PAID_ID = "e2e37101-0000-4000-8000-000000000371";
const E2E_ORDER_ONLINE_PAID_ITEM_ID = "e2e37111-0000-4000-8000-000000000371";
export const E2E_PAYMENT_SUCCEEDED_ID = "e2e37121-0000-4000-8000-000000000371";
/** What the seeded attempt charged — the refund dialog's ceiling. */
export const E2E_PAYMENT_SUCCEEDED_AMOUNT = "1299.00";

export default async function globalSetup(): Promise<void> {
  // The generated client uses the pg driver adapter (see prisma/seed.ts) — a
  // bare `new PrismaClient()` throws instead of reading DATABASE_URL itself.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const category = await prisma.category.upsert({
      where: { slug: E2E_CATEGORY_SLUG },
      update: {},
      create: { name: "E2E Category", slug: E2E_CATEGORY_SLUG },
    });

    // Stock lives on the Product row itself (no variant model — sibling
    // positions in a ProductGroup are separate Products). Keep it in stock so
    // add-to-cart always succeeds.
    const product = await prisma.product.upsert({
      where: { slug: E2E_PRODUCT_SLUG },
      update: { isActive: true, deletedAt: null, stock: 100 },
      create: {
        name: "E2E Test Product",
        slug: E2E_PRODUCT_SLUG,
        description: "Deterministic product for Playwright E2E.",
        price: "499.00",
        sku: "E2E-SKU-1",
        stock: 100,
        categoryId: category.id,
        isActive: true,
      },
    });

    // A sold-out sibling in the same category (TASK-830): the one row that lets
    // a spec prove «Тільки в наявності» actually removes something. Stock is
    // forced back to 0 on every run so a manual restock cannot turn it green.
    await prisma.product.upsert({
      where: { slug: E2E_SOLD_OUT_PRODUCT_SLUG },
      update: {
        isActive: true,
        deletedAt: null,
        stock: 0,
        categoryId: category.id,
      },
      create: {
        name: E2E_SOLD_OUT_PRODUCT_NAME,
        slug: E2E_SOLD_OUT_PRODUCT_SLUG,
        description: "Deterministic sold-out product for Playwright E2E.",
        price: "399.00",
        sku: "E2E-SKU-SOLD-OUT",
        stock: 0,
        categoryId: category.id,
        isActive: true,
      },
    });

    const passwordHash = await argon2.hash(E2E_USER_PASSWORD);
    const user = await prisma.user.upsert({
      where: { email: E2E_USER_EMAIL },
      update: { passwordHash, isActive: true, deletedAt: null },
      create: {
        email: E2E_USER_EMAIL,
        passwordHash,
        firstName: "E2E",
        lastName: "User",
        isActive: true,
      },
    });

    // Staff account for the admin projects. ADMIN, not MANAGER: the owner role
    // needs no permission rows, so the fixture stays independent of whatever the
    // RBAC matrix currently grants a manager.
    const adminPasswordHash = await argon2.hash(E2E_ADMIN_PASSWORD);
    await prisma.user.upsert({
      where: { email: E2E_ADMIN_EMAIL },
      update: {
        passwordHash: adminPasswordHash,
        role: "ADMIN",
        isActive: true,
        deletedAt: null,
      },
      create: {
        email: E2E_ADMIN_EMAIL,
        passwordHash: adminPasswordHash,
        firstName: "E2E",
        lastName: "Admin",
        role: "ADMIN",
        isActive: true,
        emailVerifiedAt: new Date(),
      },
    });

    // TASK-715: a MANAGER's rights are exactly its `user_permissions` rows
    // (plan 181 — no role matrix any more), so the grant set is replaced, not
    // merged: every other row is removed before the one right is written.
    const managerPasswordHash = await argon2.hash(E2E_MANAGER_RO_PASSWORD);
    const manager = await prisma.user.upsert({
      where: { email: E2E_MANAGER_RO_EMAIL },
      update: {
        passwordHash: managerPasswordHash,
        role: "MANAGER",
        isActive: true,
        deletedAt: null,
      },
      create: {
        email: E2E_MANAGER_RO_EMAIL,
        passwordHash: managerPasswordHash,
        firstName: "E2E",
        lastName: "Reader",
        role: "MANAGER",
        isActive: true,
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.userPermission.deleteMany({
      where: {
        userId: manager.id,
        permission: { notIn: E2E_MANAGER_RO_PERMISSIONS },
      },
    });
    for (const permission of E2E_MANAGER_RO_PERMISSIONS) {
      await prisma.userPermission.upsert({
        where: { userId_permission: { userId: manager.id, permission } },
        update: {},
        create: { userId: manager.id, permission },
      });
    }

    // Two orders that differ only in status — the minimum needed to prove a
    // status filter actually filters. `createdAt` is stamped on every run (the
    // list sorts by it, desc, and pages at 20) so these two rows are always on
    // page one no matter how much other data the test DB has accumulated.
    const orderFixtures = [
      {
        id: E2E_ORDER_PROCESSING_ID,
        itemId: E2E_ORDER_PROCESSING_ITEM_ID,
        status: "PROCESSING" as const,
      },
      {
        id: E2E_ORDER_PENDING_ID,
        itemId: E2E_ORDER_PENDING_ITEM_ID,
        status: "PENDING" as const,
      },
    ];

    for (const fixture of orderFixtures) {
      const now = new Date();
      await prisma.order.upsert({
        where: { id: fixture.id },
        update: {
          status: fixture.status,
          deletedAt: null,
          createdAt: now,
        },
        create: {
          id: fixture.id,
          userId: user.id,
          status: fixture.status,
          paymentStatus: "PENDING",
          paymentMethod: "ON_DELIVERY",
          subtotal: "499.00",
          total: "499.00",
          createdAt: now,
          items: {
            create: [
              {
                id: fixture.itemId,
                productId: product.id,
                quantity: 1,
                price: "499.00",
              },
            ],
          },
        },
      });
    }

    // TASK-371: the paid ONLINE order and its successful attempt. Both upserts
    // put the rows back to exactly this state, so a hand-made change on the test
    // DB (or a refund callback that somehow landed) cannot leak into the next run.
    const paidAt = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.order.upsert({
      where: { id: E2E_ORDER_ONLINE_PAID_ID },
      update: {
        status: "CONFIRMED",
        paymentStatus: "PAID",
        paymentMethod: "ONLINE",
        paidAt,
        deletedAt: null,
      },
      create: {
        id: E2E_ORDER_ONLINE_PAID_ID,
        userId: user.id,
        status: "CONFIRMED",
        paymentStatus: "PAID",
        paymentMethod: "ONLINE",
        paidAt,
        subtotal: E2E_PAYMENT_SUCCEEDED_AMOUNT,
        total: E2E_PAYMENT_SUCCEEDED_AMOUNT,
        createdAt: paidAt,
        items: {
          create: [
            {
              id: E2E_ORDER_ONLINE_PAID_ITEM_ID,
              productId: product.id,
              quantity: 1,
              price: E2E_PAYMENT_SUCCEEDED_AMOUNT,
            },
          ],
        },
      },
    });
    await prisma.payment.upsert({
      where: { id: E2E_PAYMENT_SUCCEEDED_ID },
      update: {
        status: "SUCCEEDED",
        amount: E2E_PAYMENT_SUCCEEDED_AMOUNT,
        settledAt: paidAt,
      },
      create: {
        id: E2E_PAYMENT_SUCCEEDED_ID,
        orderId: E2E_ORDER_ONLINE_PAID_ID,
        provider: "liqpay",
        providerPaymentId: "e2e-liqpay-371",
        amount: E2E_PAYMENT_SUCCEEDED_AMOUNT,
        currency: "UAH",
        status: "SUCCEEDED",
        settledAt: paidAt,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}
