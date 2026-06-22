import { test, expect } from "@playwright/test";
import { E2E_USER_EMAIL, E2E_USER_PASSWORD } from "./fixtures/seed-e2e";

/**
 * Auth flow: a seeded user can log in and then reach checkout (the guard that
 * redirects guests no longer fires). Selectors lean on accessible roles/labels;
 * adjust if the login form markup changes.
 */
test.describe("auth flow", () => {
  test("a registered user can log in", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel(/(пошта|email)/i).fill(E2E_USER_EMAIL);
    await page.getByLabel(/(пароль|password)/i).fill(E2E_USER_PASSWORD);
    await page
      .getByRole("button", { name: /(увійти|вхід|login|sign in)/i })
      .click();

    // After login the app navigates away from /login.
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("a logged-in user can open checkout", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/(пошта|email)/i).fill(E2E_USER_EMAIL);
    await page.getByLabel(/(пароль|password)/i).fill(E2E_USER_PASSWORD);
    await page
      .getByRole("button", { name: /(увійти|вхід|login|sign in)/i })
      .click();
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto("/checkout");
    // Authenticated: checkout must NOT bounce back to login.
    await expect(page).not.toHaveURL(/\/login/);
  });
});
