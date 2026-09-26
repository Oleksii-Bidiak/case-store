import { test, expect } from "./fixtures/test";
import {
  E2E_ORDER_ONLINE_PAID_ID,
  E2E_PAYMENT_SUCCEEDED_ID,
} from "./fixtures/seed-e2e";
import { loginAsAdmin } from "./fixtures/admin-session";

/**
 * TASK-371 — the payment card on the order: the LiqPay attempt history and a
 * PARTIAL refund through the real admin UI.
 *
 * jsdom covers each branch of the dialog (`refund-payment-button.test.tsx`)
 * and the API contract is pinned by `apps/store-api/test/admin-payment.e2e-spec.ts`;
 * this proves the two meet in a real browser against the seeded order: the
 * attempt the API lists is the one the dialog refunds, the typed amount is what
 * leaves the browser, and the screen says «requested», not «refunded».
 *
 * The refund POST is intercepted with `page.route` and answered 202 exactly as
 * the controller would, so no request ever reaches LiqPay and the seeded
 * attempt stays SUCCEEDED for the next run.
 *
 * Strings are the admin dictionary's (`dict.orders`), hardcoded because the app
 * is not importable from the root-level suite — same convention as the other
 * admin specs.
 */

const ORDER_URL = `/orders/${E2E_ORDER_ONLINE_PAID_ID}`;
const ORDER_HEADING = `Замовлення #${E2E_ORDER_ONLINE_PAID_ID.slice(0, 8)}`;

const ATTEMPTS_HEADING = "Спроби оплати";
const ATTEMPT_SUCCEEDED = "Успішна";
const REFUND_ACTION = "Повернути кошти";
const MODE_PARTIAL = "Частину";
const AMOUNT_LABEL = "Сума повернення, ₴";
const NEXT = "Далі";
const CONFIRM_TITLE = "Підтвердіть повернення";
const REQUESTED =
  "Запит на повернення надіслано. Статус оплати оновиться після підтвердження LiqPay.";
const PENDING = "Запит надіслано — чекаємо підтвердження LiqPay";

test.describe("order payment card — partial refund (TASK-371)", () => {
  test("lists the paid attempt and requests a partial refund of exactly the typed amount", async ({
    page,
  }) => {
    const refundBodies: unknown[] = [];
    await page.route(
      `**/api/admin/payments/${E2E_PAYMENT_SUCCEEDED_ID}/refund`,
      async (route) => {
        refundBodies.push(route.request().postDataJSON());
        await route.fulfill({
          status: 202,
          contentType: "application/json",
          body: JSON.stringify({ data: { accepted: true } }),
        });
      },
    );

    await loginAsAdmin(page);
    await page.goto(ORDER_URL);

    await expect(
      page.getByRole("heading", { name: ORDER_HEADING }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: ATTEMPTS_HEADING }),
    ).toBeVisible();

    const attempt = page
      .getByTestId("payment-attempt")
      .filter({ hasText: ATTEMPT_SUCCEEDED });
    await expect(attempt).toHaveCount(1);
    await expect(attempt).toContainText("e2e-liqpay-371");

    await attempt.getByRole("button", { name: REFUND_ACTION }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(MODE_PARTIAL).check();
    await dialog.getByLabel(AMOUNT_LABEL).fill("499,50");
    await dialog.getByRole("button", { name: NEXT }).click();

    // The confirmation repeats the exact sum before anything is sent.
    await expect(dialog.getByText(CONFIRM_TITLE)).toBeVisible();
    await expect(dialog).toContainText(/499,5\s₴/);
    expect(refundBodies).toHaveLength(0);

    await dialog.getByRole("button", { name: /^Повернути 499,5/ }).click();

    await expect(page.getByText(REQUESTED)).toBeVisible();
    // The comma typed by the operator leaves the browser as the API's dot.
    expect(refundBodies).toEqual([{ amount: "499.50" }]);

    // 202 is "requested": nothing flips — the attempt is still «Успішна», and
    // the button is off until the provider's callback (TASK-1302).
    await expect(attempt).toContainText(ATTEMPT_SUCCEEDED);
    await expect(
      attempt.getByRole("button", { name: REFUND_ACTION }),
    ).toBeDisabled();
    await expect(attempt.getByText(PENDING)).toBeVisible();
  });
});
