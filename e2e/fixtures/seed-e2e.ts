import * as path from "node:path";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
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
  const prisma = new PrismaClient();
  try {
    const category = await prisma.category.upsert({
      where: { slug: "e2e-category" },
      update: {},
      create: { name: "E2E Category", slug: "e2e-category" },
    });

    const product = await prisma.product.upsert({
      where: { slug: E2E_PRODUCT_SLUG },
      update: { isActive: true, deletedAt: null },
      create: {
        name: "E2E Test Product",
        slug: E2E_PRODUCT_SLUG,
        description: "Deterministic product for Playwright E2E.",
        price: "499.00",
        sku: "E2E-SKU-1",
        categoryId: category.id,
        isActive: true,
      },
    });

    // Ensure the product has an in-stock variant so add-to-cart succeeds.
    const existingVariant = await prisma.productVariant.findFirst({
      where: { productId: product.id },
    });
    if (!existingVariant) {
      await prisma.productVariant.create({
        data: {
          productId: product.id,
          name: "Default",
          sku: "E2E-VAR-1",
          price: "499.00",
          stock: 100,
        },
      });
    }

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
