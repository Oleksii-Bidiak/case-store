import { expect, type Page } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from "./seed-e2e";

/**
 * Sign the seeded staff account in, inside THIS page's own context (TASK-405).
 *
 * ## Why not a saved `storageState`
 *
 * The obvious shape — one `admin-setup` project that logs in once and writes
 * `storageState`, with every spec starting from that file — cannot work against
 * this API. The long half of the session is the `refreshToken` cookie, and
 * `AuthService.refreshTokens` ROTATES it: the presented token is revoked and a
 * new one issued (`auth.service.ts:408`). The admin app re-mints its in-memory
 * access token from that cookie on every cold page load, so a saved file is a
 * one-use credential. And it fails worse than by merely expiring — presenting a
 * revoked token IS reuse, and reuse detection revokes every token the user holds
 * (`auth.service.ts:380-384`, RFC 6819 §5.2.2), so the second context to open
 * the file lands on /login and takes any other live session down with it.
 *
 * Measured before this was written: the saved cookies were all present and
 * unexpired, the setup project passed, and the very next test still rendered the
 * login screen. Whether even the first consumer survives is a race between the
 * setup's own refresh and `storageState()` capturing the cookie.
 *
 * A login per test costs ~2s and gives each context a token only it will use.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");

  // Labels are the Ukrainian strings from
  // `apps/store-admin/src/shared/config/dictionary.ts` (`dict.login`); the admin
  // app is not importable from here, so they are matched loosely.
  await page.getByLabel(/(електронна пошта|email)/i).fill(E2E_ADMIN_EMAIL);
  await page.getByLabel(/пароль/i).fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: /^увійти$/i }).click();

  // A CUSTOMER login is rejected in place with "не має прав адміністратора", so
  // leaving /login is itself the proof that the seeded account is staff.
  await expect(page).not.toHaveURL(/\/login/);

  // ...but leaving /login is NOT proof that the next navigation will be served
  // the dashboard (TASK-463). `proxy.ts` gates every admin route on the
  // `admin_ui_session` marker cookie — it cannot see the API's HttpOnly refresh
  // cookie, which lives on another host — and that marker is written by
  // `AuthProvider.setTokens`, separately from the redirect this assertion
  // watches. Return too early and the very next `page.goto` arrives without the
  // marker, the proxy redirects to /login, and the spec fails with a missing
  // table row: exactly the residual flake left after the rate-limit and
  // concurrent-refresh causes were fixed.
  //
  // Waiting on the cookie rather than on a dashboard element is deliberate: the
  // marker IS what the proxy checks, so this asserts the precondition itself
  // instead of a proxy for it.
  await expect
    .poll(
      async () => {
        const cookies = await page.context().cookies();
        return cookies.some((cookie) => cookie.name === "admin_ui_session");
      },
      { message: "admin_ui_session marker cookie was never written" },
    )
    .toBe(true);
}
