import { test, expect } from "./fixtures/test";
import { E2E_ADMIN_EMAIL } from "./fixtures/seed-e2e";
import { loginAsAdmin } from "./fixtures/admin-session";

/**
 * TASK-480 — «Персонал», end to end.
 *
 * The check this exists for is the one the 2026-08-27 live run failed: an owner
 * who wants to hire a manager must be able to FIND where that happens. Every
 * assertion below is about the route being reachable and saying what it is —
 * jsdom can prove the components render, but not that `/staff` is in the menu,
 * that `/staff/templates` resolves ahead of `/staff/[id]`, or that the register
 * survives a hard load with a filter in the URL.
 *
 * ## What the seeded account is, and why the assertions stop where they do
 *
 * `e2e-admin@test.com` is `role: ADMIN` with no `isOwner` flag (see
 * `seed-e2e.ts`), i.e. a DEPUTY in the access model. That is the more
 * interesting of the two sessions to drive, because it is the one whose UI is
 * narrower than the owner's — but it also means the owner's reserve (the ADMIN
 * level in the wizard, ownership transfer) is deliberately NOT asserted here:
 * those depend on a flag this fixture does not set, and a spec that pinned them
 * would fail the day somebody legitimately made this account the owner. Their
 * presence-and-absence is pinned in Jest, where the session is a prop:
 * `CreateStaffButton.test.tsx` and `UserRoleChange.test.tsx`.
 *
 * Ukrainian strings are `dict.staff` / `dict.nav` from the admin dictionary,
 * hardcoded because the app is not importable from the root-level suite.
 */

const NAV_STAFF = "Персонал";
const NAV_USERS = "Користувачі";
const HEADING_TEMPLATES = "Шаблони прав";
const CTA_HIRE = "Новий співробітник";
const COPY_RULE_FRAGMENT = "НЕ змінює прав тих, хто вже працює";
/** What `staffDisplayName` renders for the seeded admin: name over address. */
const E2E_ADMIN_NAME = "E2E Admin";
// Both verb forms, because the seed creates exactly ONE admin and the heading
// declines: «Повний доступ МАЄ 1 особа» / «…МАЮТЬ 2 особи». A plural-only
// fragment passes only on a stand that happens to have hired a second admin.
const FULL_ACCESS_PATTERN = /Повний доступ (має|мають) \d+ (особа|особи|осіб)/;

test.describe("admin «Персонал» (TASK-480)", () => {
  // Own session per test: the saved-state shortcut does not survive this API's
  // refresh-token rotation. See fixtures/admin-session.ts.
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("is reachable from the navigation and lists the signed-in account", async ({
    page,
  }) => {
    await page.goto("/");

    // The whole point of the section: it is FINDABLE. The owner's report was
    // that creating a manager appeared impossible, not that it errored.
    await page.getByRole("link", { name: NAV_STAFF }).click();

    await expect(page).toHaveURL(/\/staff$/);
    await expect(page.getByRole("heading", { name: NAV_STAFF })).toBeVisible();
    await expect(page.getByText(E2E_ADMIN_EMAIL).first()).toBeVisible();
  });

  test("shows the standing «Повний доступ мають N осіб» panel, naming them", async ({
    page,
  }) => {
    await page.goto("/staff");

    // Decision 5: the number of administrators is not capped, it is made
    // visible — permanently, above the list, rather than behind a filter
    // somebody would have to think to apply.
    await expect(page.getByText(FULL_ACCESS_PATTERN).first()).toBeVisible();

    // The panel NAMES them, which is the whole point of decision 5 — a count on
    // its own answers "how many", never "who". So the link carries the person's
    // name when there is one and falls back to the address only when there is
    // not; the seeded account has both, so accept either rather than pinning
    // the spec to which fixture happens to be in the database.
    await expect(
      page
        .getByRole("link", {
          name: new RegExp(`${E2E_ADMIN_NAME}|${E2E_ADMIN_EMAIL}`, "i"),
        })
        .first(),
    ).toBeVisible();
  });

  test("opens the hiring wizard from the register", async ({ page }) => {
    await page.goto("/staff");

    await page.getByRole("button", { name: CTA_HIRE }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Step 1 is the account; the level radio is the decision that branches.
    await expect(dialog.getByLabel("Електронна пошта")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Далі" })).toBeVisible();
  });

  test("«Шаблони прав» resolves ahead of the /staff/[id] route and states the copy rule", async ({
    page,
  }) => {
    // `/staff/templates` is a static segment under a dynamic sibling. If Next
    // ever resolved it as an id this page would redirect to /staff on the 404.
    await page.goto("/staff/templates");

    await expect(page).toHaveURL(/\/staff\/templates$/);
    await expect(
      page.getByRole("heading", { name: HEADING_TEMPLATES }),
    ).toBeVisible();
    // The sentence the whole model hinges on, on the screen where a template is
    // edited.
    await expect(page.getByText(COPY_RULE_FRAGMENT).first()).toBeVisible();
  });

  test("a deep-linked ?role=MANAGER still responds to the filter controls", async ({
    page,
  }) => {
    // The TASK-405 failure mode: a statically prerendered route serves one
    // prerender for every query string, so a hard load of a filtered URL
    // followed by a query-only replace re-renders nothing. `force-dynamic` on
    // the route is what makes this pass.
    await page.goto("/staff?role=MANAGER");

    await expect(page.getByRole("heading", { name: NAV_STAFF })).toBeVisible();

    // The seeded staff account is an ADMIN, so the MANAGER filter empties the
    // list — and switching the filter to «Адміністратор» must bring it back.
    await page.getByRole("combobox", { name: "Фільтр за рівнем" }).click();
    await page.getByRole("option", { name: "Адміністратор" }).click();

    await expect(page).toHaveURL(/[?&]role=ADMIN\b/);
    await expect(page.getByText(E2E_ADMIN_EMAIL).first()).toBeVisible();
  });

  test("«Користувачі» is the customer list and no longer offers hiring", async ({
    page,
  }) => {
    await page.goto("/users");

    await expect(page.getByRole("heading", { name: "Клієнти" })).toBeVisible();
    // The CTA TASK-406 put here created accounts that never appeared in this
    // list once `/api/users` narrowed to shoppers. It lives on /staff now.
    await expect(page.getByRole("button", { name: CTA_HIRE })).toHaveCount(0);
    await expect(page.getByRole("link", { name: NAV_USERS })).toBeVisible();
  });
});
