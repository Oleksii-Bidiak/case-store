import { test, expect } from "./fixtures/test";
import { E2E_ORDER_PENDING_ID } from "./fixtures/seed-e2e";
import { loginAsAdmin } from "./fixtures/admin-session";
import { waitForHydration } from "./fixtures/hydration";

/**
 * TASK-648 / TASK-1021 — delivery in the admin's orders, against a real API.
 *
 * What only the real stack proves: the «Спосіб доставки» filter's CSV is one
 * `GET /admin/orders` accepts and actually filters by (the seeded orders are
 * NOVA_POSHTA by the column default), the facets endpoint answers the sheet,
 * the `?pickupPointId=` deep link from `/settings/delivery` round-trips as a
 * chip, and the phone-order form refuses card payment up front for an address
 * with no Nova Poshta city (the server's delivery × payment matrix).
 *
 * The widget-level halves live next to the code:
 * `widgets/order-list/ui/admin-order-table.test.tsx`,
 * `widgets/order-detail/ui/order-delivery-section.test.tsx`,
 * `features/order-create/ui/order-create-form.test.tsx`.
 *
 * Labels are `dict.orders.*` / `dict.orderCreate.*` from the admin dictionary,
 * hardcoded because the app is not importable from this suite. The admin
 * apostrophe is `ʼ` (U+02BC).
 */

const PENDING_ROW = E2E_ORDER_PENDING_ID.slice(0, 8).toUpperCase();

const FILTERS = /^Фільтри/;
const DELIVERY_GROUP = "Фільтр за способом доставки";
const NP = "Нова Пошта";
const PICKUP = "Самовивіз";
const COURIER = "Курʼєр по місту";
const OTHER = "Інша доставка";

test.describe("admin orders — delivery (TASK-648)", () => {
  // Own session per test: see fixtures/admin-session.ts.
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("filters the queue by delivery method from the sheet", async ({
    page,
  }) => {
    await page.goto("/orders");
    await expect(page.getByText(`#${PENDING_ROW}`)).toBeVisible();

    await page.getByRole("button", { name: FILTERS }).click();
    const sheet = page.getByRole("dialog");
    const group = sheet.getByRole("group", { name: DELIVERY_GROUP });
    for (const label of [NP, PICKUP, COURIER, OTHER]) {
      await expect(group.getByRole("checkbox", { name: label })).toBeVisible();
    }

    // A pickup-only queue cannot hold the seeded Nova Poshta order.
    await group.getByRole("checkbox", { name: PICKUP }).click();
    await sheet.getByRole("button", { name: /^Показати/ }).click();

    await expect(page).toHaveURL(/deliveryMethod=PICKUP/);
    await expect(
      page.getByRole("button", { name: /Доставка: Самовивіз/ }),
    ).toBeVisible();
    await expect(page.getByText(`#${PENDING_ROW}`)).toHaveCount(0);

    // …and a Nova Poshta one does.
    await page.goto("/orders?deliveryMethod=NOVA_POSHTA");
    await expect(page.getByText(`#${PENDING_ROW}`)).toBeVisible();
  });

  test("keeps a pickup-point deep link as a removable chip", async ({
    page,
  }) => {
    // A point that does not exist: the chip falls back to its generic name.
    await page.goto(
      "/orders?pickupPointId=00000000-0000-4000-8000-000000000648",
    );

    const chip = page.getByRole("button", { name: /Точка самовивозу/ });
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(page).not.toHaveURL(/pickupPointId=/);
  });

  test("shows one «Доставка» block with the method on the order card", async ({
    page,
  }) => {
    await page.goto(`/orders/${E2E_ORDER_PENDING_ID}`);

    const block = page.getByRole("region", { name: "Доставка" });
    await expect(block).toBeVisible();
    await expect(block.getByText(NP, { exact: true })).toBeVisible();
    await expect(block.getByText("Отримувач")).toBeVisible();
  });

  test("a phone order offers card payment only for a Nova Poshta city (TASK-1021)", async ({
    page,
  }) => {
    await page.goto("/orders/new");
    const group = page.getByRole("group", { name: /Спосіб оплати/i });
    await waitForHydration(page.locator("form").filter({ has: group }));

    await expect(group.getByRole("button", { name: "Картка онлайн" })).toBeDisabled();
    await expect(
      group.getByRole("button", { name: "Оплата частинами" }),
    ).toBeDisabled();
    await expect(
      page.getByText(/лише для міста зі списку Нової Пошти/),
    ).toBeVisible();
    await expect(
      group.getByRole("button", { name: "Оплата при отриманні" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
