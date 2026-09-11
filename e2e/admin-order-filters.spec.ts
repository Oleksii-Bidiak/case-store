import { test, expect, type Page } from "@playwright/test";
import {
  E2E_ORDER_PENDING_ID,
  E2E_ORDER_PROCESSING_ID,
} from "./fixtures/seed-e2e";
import { loginAsAdmin } from "./fixtures/admin-session";

/**
 * TASK-405 — `/orders?status=…` opened directly (a fresh tab, a pasted link) and
 * then filtered from the UI.
 *
 * This is the one check in the task that only a real browser can make. The two
 * causes it covers are invisible to jsdom:
 *
 *   1. The route was statically prerendered, so a hard load carrying a query
 *      string served a prerender that a later query-only `router.replace()`
 *      never re-rendered — the tabs wrote the URL and the list sat still.
 *      Fixed by `export const dynamic = "force-dynamic"` on the list routes.
 *   2. The "Всі" tab carried `value: ""`, which is not a legal Radix `Tabs`
 *      value. Fixed with the `__all__` sentinel, which must never reach the URL.
 *
 * The widget-level halves live in
 * `apps/store-admin/src/widgets/order-list/ui/admin-order-table.test.tsx`; only
 * the round trip through Next's router is asserted here.
 *
 * Tab labels are `dict.orders.tab*` from the admin dictionary, hardcoded because
 * the app is not importable from the root-level Playwright suite.
 */

/** The admin table prints `id.slice(0, 8)` — that prefix identifies a row. */
const PROCESSING_ROW = E2E_ORDER_PROCESSING_ID.slice(0, 8);
const PENDING_ROW = E2E_ORDER_PENDING_ID.slice(0, 8);

const TAB_NEW = "Нові";
const TAB_ALL = "Всі";

/**
 * Wait for the queue to settle: the toolbar's refresh spinner is `aria-hidden`,
 * so assert on the rows themselves rather than on a loading flag.
 */
async function expectOnlyRow(page: Page, visible: string, hidden: string) {
  await expect(page.getByText(visible)).toBeVisible();
  await expect(page.getByText(hidden)).toHaveCount(0);
}

test.describe("admin order filters (TASK-405)", () => {
  // Own session per test: the saved-state shortcut does not survive this
  // API's refresh-token rotation. See fixtures/admin-session.ts.
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("a deep-linked ?status=PROCESSING still responds to the tabs", async ({
    page,
  }) => {
    // Hard load with the filter already in the URL — the exact state the demo
    // run was in when the controls went dead.
    await page.goto("/orders?status=PROCESSING");

    await expectOnlyRow(page, PROCESSING_ROW, PENDING_ROW);

    await page.getByRole("tab", { name: TAB_NEW }).click();

    // The click must move both the URL and the list.
    await expect(page).toHaveURL(/[?&]status=PENDING\b/);
    await expectOnlyRow(page, PENDING_ROW, PROCESSING_ROW);
  });

  test("«Всі» clears a deep-linked filter without leaking the sentinel", async ({
    page,
  }) => {
    await page.goto("/orders?status=PROCESSING");
    await expectOnlyRow(page, PROCESSING_ROW, PENDING_ROW);

    const allTab = page.getByRole("tab", { name: TAB_ALL });
    await allTab.click();

    // `__all__` is a UI-only value: the URL simply loses `?status=`.
    await expect(page).not.toHaveURL(/[?&]status=/);
    await expect(page).not.toHaveURL(/__all__/);

    // And with no filter, the sentinel is what makes the tab render active —
    // with `value: ""` it could not.
    await expect(allTab).toHaveAttribute("data-state", "active");

    await expect(page.getByText(PROCESSING_ROW)).toBeVisible();
    await expect(page.getByText(PENDING_ROW)).toBeVisible();
  });
});
