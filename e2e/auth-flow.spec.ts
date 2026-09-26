import { test, expect, type Page } from "./fixtures/test";
import { E2E_USER_EMAIL, E2E_USER_PASSWORD } from "./fixtures/seed-e2e";
import { waitForHydration } from "./fixtures/hydration";

/**
 * Auth flow: a seeded user can log in and then reach checkout (the guard that
 * redirects guests no longer fires). Selectors lean on accessible roles/labels;
 * adjust if the login form markup changes.
 */

/**
 * Fill and submit the storefront login form. The post-login target ("/") is
 * compiled by the warm-up global setup before any test runs, and the click
 * waits for hydration — the two cold-run failure modes of TASK-753.
 */
async function logIn(page: Page): Promise<void> {
  await page.goto("/login");

  const submit = page.getByRole("button", {
    name: /(увійти|вхід|login|sign in)/i,
  });
  await waitForHydration(page.locator("form").filter({ has: submit }));

  await page.getByLabel(/(пошта|email)/i).fill(E2E_USER_EMAIL);
  await page.getByLabel(/(пароль|password)/i).fill(E2E_USER_PASSWORD);
  await submit.click();
}

test.describe("auth flow", () => {
  test("a registered user can log in", async ({ page }) => {
    await logIn(page);

    // After login the app navigates away from /login.
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("a logged-in user can open checkout", async ({ page }) => {
    await logIn(page);
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto("/checkout");
    // Authenticated: checkout must NOT bounce back to login.
    await expect(page).not.toHaveURL(/\/login/);
  });
});
