import type { Page, Request } from "@playwright/test";
import { test, expect } from "./fixtures/test";
import { addSeededProductToCart } from "./fixtures/cart";

/**
 * Checkout delivery methods (TASK-646, CheckoutDelivery.dc.html) — the pickup and
 * the courier happy paths, end to end in a real browser.
 *
 * The seeded test database keeps the delivery settings at their defaults (Nova
 * Poshta and «інша доставка» on, no pickup points), and the admin suite owns
 * those settings — flipping them here would race `admin-settings-delivery`. So
 * this spec mocks the two calls the storefront makes about delivery:
 *
 *   - `GET /api/delivery/methods` — the offer the checkout is drawn from;
 *   - `POST /api/orders` — captured and answered with a minimal order, because
 *     the real API would (correctly) refuse a pickup point that does not exist.
 *
 * What is under test is the storefront: which fields each method shows, what
 * the summary charges, and the exact `CreateOrderDto` it sends. The server's
 * side of the same contract is covered by the store-api e2e suite.
 */

const PICKUP_POINT = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Магазин на Хрещатику",
  city: "Київ",
  address: "вул. Хрещатик, 22",
  phone: "+380441234567",
  workingHours: "Пн–Сб 10:00–20:00",
  mapUrl: "https://maps.example/khreshchatyk",
};

const METHODS = {
  methods: ["NOVA_POSHTA", "PICKUP", "COURIER", "OTHER"],
  courier: { price: "150.00", freeFrom: "2000.00", cityName: "Київ" },
  pickupPoints: [PICKUP_POINT],
  paymentMatrix: {
    NOVA_POSHTA: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
    PICKUP: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
    COURIER: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
    OTHER: ["ON_DELIVERY"],
  },
};

/** Mock the delivery offer and capture the create-order call. */
async function mockDelivery(page: Page): Promise<() => Promise<Request>> {
  await page.route("**/api/delivery/methods", (route) =>
    route.fulfill({ json: { data: METHODS } }),
  );
  await page.route("**/api/orders", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return route.fulfill({
      status: 201,
      json: {
        data: {
          id: "22222222-2222-4222-8222-222222222222",
          status: "PENDING",
          paymentStatus: "PENDING",
          paymentMethod: "ON_DELIVERY",
          total: "499.00",
        },
      },
    });
  });
  return () =>
    page.waitForRequest(
      (request) =>
        request.method() === "POST" && /\/api\/orders$/.test(request.url()),
    );
}

/** Contact + recipient — the half of step 1 every method shares. */
async function fillGuestAndRecipient(page: Page) {
  const main = page.getByRole("main");
  await main.locator("#checkout-email").fill("olena@example.com");
  await main.getByLabel("Ім'я", { exact: true }).fill("Олена");
  await main.getByLabel("Прізвище", { exact: true }).fill("Шевченко");
  // `fill`, not keystrokes: the field opens on «+380» with the caret in
  // front of it, so typed digits would land before the prefix.
  await main.locator("#checkout-phone").fill("+380501234567");
}

/** «Далі» → review → consent → «Підтвердити замовлення». */
async function confirm(page: Page) {
  const main = page.getByRole("main");
  await main.getByRole("button", { name: "Далі" }).click();
  await expect(
    main.getByRole("heading", { name: "Перевірте деталі замовлення" }),
  ).toBeVisible();
  await main.getByRole("checkbox", { name: "Я приймаю умови" }).check();
  await main.getByRole("button", { name: "Підтвердити замовлення" }).click();
}

test.describe("checkout delivery methods (TASK-646)", () => {
  test("a guest picks up from the shop: free delivery, the point's id travels", async ({
    page,
  }) => {
    const orderRequest = await mockDelivery(page);
    await addSeededProductToCart(page);
    await page.goto("/checkout");

    const main = page.getByRole("main");
    const methods = main.getByRole("radiogroup", { name: "Спосіб доставки" });
    await expect(methods.getByRole("radio")).toHaveCount(4);
    await methods.getByRole("radio", { name: /Самовивіз з магазину/ }).check();

    // The only point is preselected; its map link opens in a new tab.
    const points = main.getByRole("radiogroup", { name: "Пункт самовивозу" });
    await expect(
      points.getByRole("radio", { name: /Магазин на Хрещатику/ }),
    ).toBeChecked();
    await expect(main.getByRole("link", { name: /Як дістатися/ })).toHaveAttribute(
      "href",
      PICKUP_POINT.mapUrl,
    );
    // No address to type for a pickup.
    await expect(main.getByLabel("Місто", { exact: true })).toHaveCount(0);

    // The summary charges nothing for delivery.
    const summary = main.getByRole("complementary");
    await expect(summary).toContainText("Доставка · Самовивіз");
    await expect(summary).toContainText("Безкоштовно");

    await fillGuestAndRecipient(page);
    const sent = orderRequest();
    await confirm(page);

    const body = (await sent).postDataJSON();
    expect(body).toMatchObject({
      deliveryMethod: "PICKUP",
      pickupPointId: PICKUP_POINT.id,
      paymentMethod: "ON_DELIVERY",
      shippingAddress: {
        firstName: "Олена",
        lastName: "Шевченко",
        city: "Київ",
        address1: "вул. Хрещатик, 22",
        country: "UA",
      },
    });
    await expect(
      main.getByRole("heading", { name: "Замовлення прийнято!" }),
    ).toBeVisible();
  });

  test("a guest orders a courier: the price joins the total, street and house become address1", async ({
    page,
  }) => {
    const orderRequest = await mockDelivery(page);
    await addSeededProductToCart(page);
    await page.goto("/checkout");

    const main = page.getByRole("main");
    await main
      .getByRole("radiogroup", { name: "Спосіб доставки" })
      .getByRole("radio", { name: /Кур'єр · Київ/ })
      .check();

    // The courier's city is fixed; the progress bar counts to the threshold.
    await expect(main.locator("#checkout-courier-city")).toHaveValue("Київ");
    await expect(main.locator("#checkout-courier-city")).toHaveAttribute(
      "readonly",
      "",
    );
    await expect(
      main.getByRole("progressbar", { name: "До безкоштовної доставки" }),
    ).toBeVisible();

    // 499 ₴ of goods + 150 ₴ courier.
    const summary = main.getByRole("complementary");
    await expect(summary).toContainText("Доставка · Кур'єр");
    await expect(summary).toContainText(/649\s₴/);

    await fillGuestAndRecipient(page);
    await main.getByLabel("Вулиця", { exact: true }).fill("вул. Саксаганського");
    await main.getByLabel("Будинок", { exact: true }).fill("12");
    await main.getByLabel(/^Квартира/).fill("7");
    const sent = orderRequest();
    await confirm(page);

    const body = (await sent).postDataJSON();
    expect(body).toMatchObject({
      deliveryMethod: "COURIER",
      shippingAddress: {
        city: "Київ",
        address1: "вул. Саксаганського, 12, кв. 7",
      },
    });
    expect(body).not.toHaveProperty("pickupPointId");
    expect(body.shippingAddress).not.toHaveProperty("npCityRef");
  });
});
