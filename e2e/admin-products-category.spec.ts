import { test, expect } from "./fixtures/test";
import { loginAsAdmin } from "./fixtures/admin-session";
import {
  CHAIN_LEAF,
  CHAIN_MID,
  CHAIN_PRODUCT_NAME,
  CHAIN_ROOT,
  seedCategoryChain,
} from "./fixtures/seed-category-chain";

/**
 * TASK-717 — the product list's «Категорія» column names a level-3 subcategory.
 *
 * The column used to be built from the public list of active ROOT categories,
 * so a product filed on a leaf — which is where the import files nearly every
 * position — showed «—». The widget-level half (admin tree vs. public fallback
 * for a manager without `categories:write`) lives in
 * `apps/store-admin/src/widgets/product-list/ui/admin-product-table.test.tsx`;
 * this spec proves the real API tree reaches the real table.
 *
 * The seeded staff account is the owner, so this exercises the admin-tree path.
 */
test.describe("admin product list — category column (TASK-717)", () => {
  test.beforeAll(async () => {
    await seedCategoryChain();
  });

  // Own session per test: see fixtures/admin-session.ts.
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("a product on a level-3 subcategory shows the leaf's name, not «—»", async ({
    page,
  }) => {
    await page.goto(
      `/products?search=${encodeURIComponent(CHAIN_PRODUCT_NAME)}`,
    );

    const row = page.locator("tr", { hasText: CHAIN_PRODUCT_NAME });
    await expect(row).toHaveCount(1);

    // «Категорія» is the column's `data-label` (dict.products.colCategory).
    const categoryCell = row.locator('td[data-label="Категорія"]');
    await expect(categoryCell).toContainText(CHAIN_LEAF.name);
    await expect(categoryCell).not.toContainText("—");
    // The leaf, not an ancestor: the lookup has to reach level 3 itself.
    await expect(categoryCell).not.toContainText(CHAIN_ROOT.name);
    await expect(categoryCell).not.toContainText(CHAIN_MID.name);
  });
});
