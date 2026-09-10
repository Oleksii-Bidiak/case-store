import * as fs from "node:fs";
import * as path from "node:path";
import { test as setup, expect } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from "./fixtures/seed-e2e";
import { ADMIN_STORAGE_STATE } from "./fixtures/admin-session";

/**
 * Admin authentication setup (TASK-405). Runs once as its own Playwright
 * project; every `admin-*.spec.ts` starts from the `storageState` it writes.
 *
 * Both halves of the session are cookies, which is why saving state is enough:
 *   - the HttpOnly refresh cookie from store-api (localhost:3001), and
 *   - `admin_ui_session`, the non-secret marker the app writes for its edge
 *     proxy (`apps/store-admin/src/proxy.ts`), which is what stops a cold
 *     navigation to a dashboard route being redirected to /login.
 * The access token lives in memory only and is re-minted from the refresh
 * cookie on every page load, so it does not need to be persisted.
 *
 * Cookies are scoped by domain, not by port, so the 3001 refresh cookie is sent
 * from the 3002 origin too — true in dev, and the reason production splits the
 * two apps onto separate hostnames.
 *
 * Labels are the Ukrainian strings from
 * `apps/store-admin/src/shared/config/dictionary.ts` (`dict.login`); the admin
 * app is not importable from here, so they are matched loosely.
 */
setup("authenticate as admin", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel(/(електронна пошта|email)/i).fill(E2E_ADMIN_EMAIL);
  await page.getByLabel(/пароль/i).fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: /^увійти$/i }).click();

  // A CUSTOMER login is rejected in-place with "не має прав адміністратора",
  // so leaving /login is itself the proof that the seeded account is staff.
  await expect(page).not.toHaveURL(/\/login/);

  // Prove the marker cookie is really written before it is saved: a cold
  // navigation to a guarded route must not bounce back to /login.
  await page.goto("/orders");
  await expect(page).not.toHaveURL(/\/login/);

  fs.mkdirSync(path.dirname(ADMIN_STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
