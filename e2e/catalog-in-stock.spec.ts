import { test, expect } from "./fixtures/test";
import {
  E2E_CATEGORY_SLUG,
  E2E_SOLD_OUT_PRODUCT_NAME,
} from "./fixtures/seed-e2e";

/**
 * «Тільки в наявності» actually filters (TASK-830, SF-CAT-13).
 *
 * The checkbox had been sending `?inStock=true` all along, and the API's where
 * clause honoured it — but the public listing's «sold-out last» partitioning
 * rebuilt its tail with `stock <= 0`, overwriting the filter, so a page short
 * of a full in-stock page was topped back up with exactly the products the
 * shopper had asked to hide. The count was right; the grid was not.
 *
 * The seeded category holds one position in stock (`test-product`) and one sold
 * out (`test-product-sold-out`), which is the smallest slice where the two
 * disagree.
 */
test.describe("catalogue availability filter", () => {
  test("«Тільки в наявності» changes the count and removes sold-out cards", async ({
    page,
  }) => {
    await page.goto(`/products?category=${E2E_CATEGORY_SLUG}`);

    const main = page.getByRole("main");
    await expect(main.getByText("Знайдено товарів: 2")).toBeVisible();
    await expect(main.getByText(E2E_SOLD_OUT_PRODUCT_NAME)).toBeVisible();

    // The native input is `sr-only` under a painted box (FilterCheckbox), so a
    // pointer click lands on the box, not the input. Toggle it the way a
    // keyboard user does — the real control, real semantics.
    const inStockOnly = main.getByRole("checkbox", {
      name: "Тільки в наявності",
    });
    await inStockOnly.focus();
    await page.keyboard.press("Space");
    await expect(inStockOnly).toBeChecked();

    await expect(page).toHaveURL(/[?&]inStock=true/);
    await expect(main.getByText("Знайдено товарів: 1")).toBeVisible();
    await expect(main.getByText(E2E_SOLD_OUT_PRODUCT_NAME)).toHaveCount(0);
    await expect(main.getByText(/E2E Test Product/)).toBeVisible();
  });
});
