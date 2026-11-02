import { test, expect } from "./fixtures/test";
import { addSeededProductToCart } from "./fixtures/cart";

/**
 * R2 (TASK-2047): «Переказ на рахунок ФОП» (`BANK_TRANSFER`) is the operator's
 * payment method for a phone order — never the shopper's.
 *
 * The server keeps two matrices: the storefront's (`GET /api/delivery/methods`)
 * and the admin's, which adds BANK_TRANSFER to every delivery. The storefront
 * knows the word only to read it back on an order. This pins both halves
 * against the real API, unmocked: the offer the checkout is drawn from carries
 * no BANK_TRANSFER, and the payment choice never shows a transfer — for any
 * delivery the shopper can pick.
 */

const PAYMENT_GROUP = "Спосіб оплати";
const DELIVERY_GROUP = "Спосіб доставки";
const TRANSFER = /Переказ на рахунок/i;

test("checkout never offers a bank transfer (R2, TASK-2047)", async ({
  page,
}) => {
  await addSeededProductToCart(page);

  const offerLoaded = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /\/api\/delivery\/methods(\?|$)/.test(response.url()),
  );
  await page.goto("/checkout");
  const offer = await offerLoaded;
  expect(offer.ok()).toBe(true);
  expect(await offer.text()).not.toContain("BANK_TRANSFER");

  const main = page.getByRole("main");
  const payment = main.getByRole("radiogroup", { name: PAYMENT_GROUP });
  const deliveries = main
    .getByRole("radiogroup", { name: DELIVERY_GROUP })
    .getByRole("radio");
  await expect(deliveries.first()).toBeVisible();

  const count = await deliveries.count();
  for (let index = 0; index < count; index += 1) {
    const delivery = deliveries.nth(index);
    if (await delivery.isDisabled()) continue;
    await delivery.check();
    await expect(payment.getByRole("radio").first()).toBeVisible();
    await expect(payment.getByRole("radio", { name: TRANSFER })).toHaveCount(0);
    await expect(payment).not.toContainText(TRANSFER);
  }
});
