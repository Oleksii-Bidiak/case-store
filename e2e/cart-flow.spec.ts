import { test, expect, type Page } from "./fixtures/test";
import { E2E_PRODUCT_SLUG } from "./fixtures/seed-e2e";

/**
 * Guest browse → add-to-cart → checkout. Exercises the guest-cart cookie
 * architecture: no login is required to add to the cart, and since TASK-338 none
 * is required to check out either — a guest is identified by the same cart
 * cookie that owns the basket being converted.
 *
 * This file used to assert the opposite (TASK-462). Its second test waited for
 * `/checkout` to bounce to `/login?redirect=/checkout`, which was true until
 * TASK-338 deleted the login wall — `checkout-view.tsx` documents the removal
 * and `checkout-view.test.tsx` already asserts the negative at the unit level.
 * The spec had been red ever since, testing a promise the storefront had
 * deliberately stopped making.
 *
 * The one redirect that remains is the empty-cart one (`checkout-view.tsx`:
 * empty cart → `/cart`), so it gets a test of its own — it is the reason a naive
 * "open /checkout" check still lands somewhere other than checkout.
 *
 * Selectors lean on accessible roles/names; adjust if the storefront markup
 * changes. This spec runs against the seeded `test-product` fixture.
 */

/**
 * Put the seeded product in this context's cart.
 *
 * Inlined into each test that needs it rather than hoisted into `beforeEach`,
 * because Playwright gives every test its own browser context: the cart cookie
 * from the first test does not exist in the second, and a guest checkout test
 * that assumed otherwise would be testing an empty cart.
 */
async function addSeededProductToCart(page: Page): Promise<void> {
  await page.goto(`/products/${E2E_PRODUCT_SLUG}`);

  // The PDP add-to-cart CTA is «Додати до кошика». Match it exactly: the header
  // has a «Кошик» button and the PDP a stub «Купити в 1 клік» (TASK-178) that
  // looser regexes used to hit instead.
  await page
    .getByRole("main")
    .getByRole("button", { name: /додати до кошика/i })
    .click();

  // Wait for the add to land: the header badge switches to the cart total.
  // Scoped to the header and matched exactly, because since TASK-409 the buy
  // box renders its own «…вже в кошику — відкрити кошик» button once the cart
  // query reports the line, and a loose regex resolves to both.
  await expect(
    page
      .getByRole("banner")
      .getByRole("button", { name: "Відкрити кошик", exact: true }),
  ).toContainText("499");
}

test.describe("guest cart flow", () => {
  test("a guest can add a product to the cart", async ({ page }) => {
    await page.goto(`/products/${E2E_PRODUCT_SLUG}`);

    await expect(
      page.getByRole("heading", { name: /E2E Test Product/i }),
    ).toBeVisible();

    await page
      .getByRole("main")
      .getByRole("button", { name: /додати до кошика/i })
      .click();

    await expect(
      page
        .getByRole("banner")
        .getByRole("button", { name: "Відкрити кошик", exact: true }),
    ).toContainText("499");

    await page.goto("/cart");
    await expect(page.getByText(/E2E Test Product/i)).toBeVisible();
  });

  test("a guest with items reaches checkout and is asked for contact details", async ({
    page,
  }) => {
    await addSeededProductToCart(page);

    await page.goto("/checkout");

    // The whole point of TASK-338: no bounce to login. Assert the URL first, so
    // a regression that reinstates the wall fails here with a clear message
    // rather than as a missing-field timeout below.
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page).not.toHaveURL(/\/login/);

    // `CheckoutContactFields` renders only for a shopper without an account, so
    // seeing the email field IS the proof the app treated this visitor as a
    // guest rather than as a session it failed to read.
    await expect(
      page.getByRole("group", { name: "Контактні дані" }),
    ).toBeVisible();
    await expect(page.locator("#checkout-email")).toBeVisible();
  });

  test("a guest with an empty cart is sent back to the cart", async ({
    page,
  }) => {
    // Fresh context, so the cart cookie does not exist and the cart is empty.
    await page.goto("/checkout");

    // A client-side `router.replace`, so no query string survives — the URL is
    // plain `/cart`, not `/login?redirect=…` as this file once expected.
    await expect(page).toHaveURL(/\/cart$/);
    await expect(
      page.getByRole("heading", { name: "Ваш кошик порожній" }),
    ).toBeVisible();
  });
});
