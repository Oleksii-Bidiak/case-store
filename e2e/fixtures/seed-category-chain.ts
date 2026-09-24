import * as path from "node:path";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Same env source as `seed-e2e.ts`: specs run from the repo root, where
// DATABASE_URL is not set, and must hit the DB the webServer-booted API uses.
loadEnv({ path: path.resolve(__dirname, "../../apps/store-api/.env") });

/**
 * A three-level category chain with one product filed on the LEAF (TASK-717).
 *
 * Its own module rather than a block in `seed-e2e.ts` (the global setup belongs
 * to another cluster of the same wave), called from the spec's `beforeAll`.
 * Idempotent: every row is upserted by slug and re-pointed at its parent, so a
 * rerun — or a manual edit of the chain between runs — converges on the same
 * shape.
 *
 * Names are unique to this fixture so a spec can find the leaf's name on screen
 * without it matching any other row: the root and middle names deliberately do
 * NOT contain the leaf's, so seeing the leaf proves the lookup reached level 3.
 */
export const CHAIN_ROOT = {
  slug: "e2e-chain-root",
  name: "E2E Корінь ланцюжка",
};
export const CHAIN_MID = { slug: "e2e-chain-mid", name: "E2E Середній рівень" };
export const CHAIN_LEAF = {
  slug: "e2e-chain-leaf",
  name: "E2E Листова підкатегорія",
};

export const CHAIN_PRODUCT_SLUG = "e2e-chain-leaf-product";
export const CHAIN_PRODUCT_NAME = "E2E Товар на листі ланцюжка";

export async function seedCategoryChain(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const root = await prisma.category.upsert({
      where: { slug: CHAIN_ROOT.slug },
      update: { name: CHAIN_ROOT.name, parentId: null, isActive: true },
      create: { name: CHAIN_ROOT.name, slug: CHAIN_ROOT.slug },
    });
    const mid = await prisma.category.upsert({
      where: { slug: CHAIN_MID.slug },
      update: { name: CHAIN_MID.name, parentId: root.id, isActive: true },
      create: { name: CHAIN_MID.name, slug: CHAIN_MID.slug, parentId: root.id },
    });
    const leaf = await prisma.category.upsert({
      where: { slug: CHAIN_LEAF.slug },
      update: { name: CHAIN_LEAF.name, parentId: mid.id, isActive: true },
      create: {
        name: CHAIN_LEAF.name,
        slug: CHAIN_LEAF.slug,
        parentId: mid.id,
      },
    });

    await prisma.product.upsert({
      where: { slug: CHAIN_PRODUCT_SLUG },
      update: {
        name: CHAIN_PRODUCT_NAME,
        categoryId: leaf.id,
        isActive: true,
        deletedAt: null,
      },
      create: {
        name: CHAIN_PRODUCT_NAME,
        slug: CHAIN_PRODUCT_SLUG,
        description: "Product on a level-3 category for the TASK-717 spec.",
        price: "299.00",
        sku: "E2E-CHAIN-1",
        stock: 5,
        categoryId: leaf.id,
        isActive: true,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}
