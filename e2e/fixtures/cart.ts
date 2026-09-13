import { expect, type Page } from "@playwright/test";
import { E2E_PRODUCT_SLUG } from "./seed-e2e";

/**
 * Put the seeded product in this context's cart.
 *
 * Call it from inside each test that needs it rather than from a `beforeEach`:
 * Playwright gives every test its own browser context, so the cart cookie from
 * one test does not exist in the next, and a checkout test that assumed
 * otherwise would be testing an empty cart.
 *
 * Shared by `cart-flow.spec.ts` (the guest journey) and `responsive.spec.ts`
 * (which cannot reach `/checkout` without it — an empty cart redirects back to
 * `/cart`).
 */
export async function addSeededProductToCart(page: Page): Promise<void> {
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
  // query reports the line, and a loose regex resolves to both. The badge is
  // outside the `min-[390px]:` cluster, so this works at 320px too.
  await expect(
    page
      .getByRole("banner")
      .getByRole("button", { name: "Відкрити кошик", exact: true }),
  ).toContainText("499");
}
