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
 *   - product slug:   `test-product`
 *   - user login:     `e2e@test.com` / `E2ePassword1!`
 *   - admin login:    `e2e-admin@test.com` / `E2eAdminPassword1!`
 *   - orders:         one PROCESSING + one PENDING (ids below)
 */
export const E2E_PRODUCT_SLUG = "test-product";
export const E2E_USER_EMAIL = "e2e@test.com";
export const E2E_USER_PASSWORD = "E2ePassword1!";

/** Staff account for the admin-panel specs — role ADMIN, i.e. the shop owner. */
export const E2E_ADMIN_EMAIL = "e2e-admin@test.com";
export const E2E_ADMIN_PASSWORD = "E2eAdminPassword1!";

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

export default async function globalSetup(): Promise<void> {
  // The generated client uses the pg driver adapter (see prisma/seed.ts) — a
  // bare `new PrismaClient()` throws instead of reading DATABASE_URL itself.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const category = await prisma.category.upsert({
      where: { slug: "e2e-category" },
      update: {},
      create: { name: "E2E Category", slug: "e2e-category" },
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
  } finally {
    await prisma.$disconnect();
  }
}
