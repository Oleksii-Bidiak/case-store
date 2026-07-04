import { test, expect } from "@playwright/test";
import { E2E_PRODUCT_SLUG } from "./fixtures/seed-e2e";

/**
 * Guest browse → add-to-cart → checkout-guard flow. Exercises the guest-cart
 * cookie architecture: no login is required to add to the cart, but reaching
 * checkout redirects an unauthenticated visitor to login.
 *
 * Selectors lean on accessible roles/names; adjust if the storefront markup
 * changes. This spec runs against the seeded `test-product` fixture.
 */
test.describe("guest cart flow", () => {
  test("a guest can add a product to the cart", async ({ page }) => {
    await page.goto(`/products/${E2E_PRODUCT_SLUG}`);

    await expect(
      page.getByRole("heading", { name: /E2E Test Product/i }),
    ).toBeVisible();

    // The PDP add-to-cart CTA is «Додати до кошика». Match it exactly: the
    // header has a «Кошик» button and the PDP a stub «Купити в 1 клік»
    // (TASK-178) that looser regexes used to hit instead.
    await page
      .getByRole("main")
      .getByRole("button", { name: /додати до кошика/i })
      .click();

    // Wait for the add to land: the header badge switches to the cart total.
    await expect(
      page.getByRole("button", { name: /відкрити кошик/i }),
    ).toContainText("499");

    await page.goto("/cart");
    await expect(page.getByText(/E2E Test Product/i)).toBeVisible();
  });

  test("checkout redirects an unauthenticated visitor to login", async ({
    page,
  }) => {
    await page.goto("/checkout");
    await expect(page).toHaveURL(/\/login\?redirect=\/checkout/);
  });
});
