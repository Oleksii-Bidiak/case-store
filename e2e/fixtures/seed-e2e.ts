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
 */
export const E2E_PRODUCT_SLUG = "test-product";
export const E2E_USER_EMAIL = "e2e@test.com";
export const E2E_USER_PASSWORD = "E2ePassword1!";

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
    await prisma.product.upsert({
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
    await prisma.user.upsert({
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
  } finally {
    await prisma.$disconnect();
  }
}
