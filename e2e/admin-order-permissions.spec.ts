import { test, expect } from "./fixtures/test";
import {
  E2E_MANAGER_RO_EMAIL,
  E2E_MANAGER_RO_PASSWORD,
  E2E_ORDER_PENDING_ID,
} from "./fixtures/seed-e2e";
import { loginAsAdmin, loginAsStaff } from "./fixtures/admin-session";

/**
 * TASK-715 — a manager who may READ orders but not change them (AD-ORD-34).
 *
 * The live run found every order control on screen for such a manager: the
 * status and payment pickers, «Змінити доставку й контакти», the waybill form, «Створити
 * замовлення». Each click reached an `orders:write` endpoint, got a 403, and was
 * reported by a toast blaming "somebody else changed the order". The rule of the
 * wave is that such controls are ABSENT, not disabled.
 *
 * jsdom proves each component hides itself (`order-detail-view.test.tsx` and
 * the feature tests); this proves the real session, fetched from
 * `GET /auth/me/permissions` for a real MANAGER row, drives the same outcome.
 * The admin run of the same card is the control: without it, "no combobox"
 * would also pass on a page that failed to load.
 *
 * Strings are the admin dictionary's (`dict.orders`, `dict.orderStatus`,
 * `dict.common`), hardcoded because the app is not importable from the
 * root-level suite — same convention as `admin-staff.spec.ts`.
 */

/** A PENDING order: the address is still editable, so its absence means something. */
const ORDER_URL = `/orders/${E2E_ORDER_PENDING_ID}`;
const ORDER_HEADING = `Замовлення #${E2E_ORDER_PENDING_ID.slice(0, 8)}`;

const VIEW_ONLY = "Ви можете переглядати, але не змінювати.";
// Wave 198 (TASK-1046): the status picker is a menu-button «Змінити статус ▾».
const STATUS_PICKER = "Змінити статус";
// R2 (TASK-1967): no payment picker any more — money is moved from the
// «Оплата» block; recording a receipt needs `orders:write`, reading does not.
const PAYMENT_BLOCK = "Оплата";
const PAYMENT_SUMMARY = "Підсумок оплати";
const PAYMENT_JOURNAL = "Журнал оплат";
const RECORD_RECEIPT = "Записати надходження";
const ADDRESS_EDIT = "Змінити доставку й контакти";
const DETAILS_SAVE = "Зберегти";
const ISSUE_LINK = "Видати нове посилання";
const CREATE_CTA = "Створити замовлення";
const CREATE_FORBIDDEN = "У вас немає права створювати замовлення.";

test.describe("order card without orders:write (TASK-715)", () => {
  test("a read-only manager sees the order and no control that changes it", async ({
    page,
  }) => {
    await loginAsStaff(page, {
      email: E2E_MANAGER_RO_EMAIL,
      password: E2E_MANAGER_RO_PASSWORD,
    });
    await page.goto(ORDER_URL);

    await expect(
      page.getByRole("heading", { name: ORDER_HEADING }),
    ).toBeVisible();
    // The one line that says the absence is deliberate.
    await expect(page.getByText(VIEW_ONLY)).toBeVisible();

    await expect(
      page.getByRole("button", { name: STATUS_PICKER, exact: true }),
    ).toHaveCount(0);
    // The money is readable — the summary and the journal — but not movable.
    const payment = page.getByRole("region", {
      name: PAYMENT_BLOCK,
      exact: true,
    });
    await expect(
      payment.getByRole("group", { name: PAYMENT_SUMMARY }),
    ).toBeVisible();
    await expect(
      payment.getByRole("heading", { name: PAYMENT_JOURNAL }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: RECORD_RECEIPT }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: ADDRESS_EDIT })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: DETAILS_SAVE, exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: ISSUE_LINK })).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);
  });

  test("a read-only manager is not offered «Створити замовлення», and /orders/new refuses once", async ({
    page,
  }) => {
    await loginAsStaff(page, {
      email: E2E_MANAGER_RO_EMAIL,
      password: E2E_MANAGER_RO_PASSWORD,
    });

    await page.goto("/orders");
    await expect(
      page.getByText(E2E_ORDER_PENDING_ID.slice(0, 8)),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: CREATE_CTA })).toHaveCount(0);

    await page.goto("/orders/new");
    // Next.js mounts its own empty role="alert" route announcer on every page,
    // so count only alerts that carry text: exactly one refusal, no second banner.
    const refusals = page.getByRole("alert").filter({ hasText: /\S/ });
    await expect(refusals).toHaveCount(1);
    await expect(refusals).toContainText(CREATE_FORBIDDEN);
  });

  test("the admin sees the same card WITH its controls (the control run)", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto(ORDER_URL);

    await expect(
      page.getByRole("button", { name: STATUS_PICKER, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: ADDRESS_EDIT }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: PAYMENT_BLOCK, exact: true })
        .getByRole("button", { name: RECORD_RECEIPT }),
    ).toBeVisible();
    await expect(page.getByText(VIEW_ONLY)).toHaveCount(0);
  });
});
