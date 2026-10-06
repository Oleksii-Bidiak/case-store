import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/test";

/**
 * Delivery AFTER checkout (TASK-647, TASK-1030; OrderConfirmation.dc.html):
 * the guest order page shows a «Доставка» block for the method the order was
 * placed with, and the public `/orders/status` page names the real method.
 *
 * The seeded test database has no pickup points and no «інша доставка» orders,
 * and the admin suite owns the delivery settings — so the two reads are mocked
 * (`GET /api/orders/guest/:token`, `POST /api/orders/lookup`). What is under
 * test is the storefront's rendering of the API's contract; the server side
 * (the snapshot, `shippingCostPending`, the public projection) is covered by
 * the store-api e2e suite.
 */

const ORDER_ID = "33333333-3333-4333-8333-333333333333";

const ITEM = {
  id: "44444444-4444-4444-8444-444444444444",
  orderId: ORDER_ID,
  productId: "55555555-5555-4555-8555-555555555555",
  variantId: null,
  productName: "Чохол MagSafe",
  productSlug: "chokhol-magsafe",
  imageUrl: null,
  quantity: 1,
  price: "599.00",
  lineTotal: "599.00",
  addons: [],
};

function guestOrder(overrides: Record<string, unknown>) {
  return {
    id: ORDER_ID,
    userId: null,
    status: "PENDING",
    paymentStatus: "PENDING",
    paymentMethod: "ON_DELIVERY",
    deliveryMethod: "NOVA_POSHTA",
    pickupPointId: null,
    subtotal: "599.00",
    addonsTotal: "0.00",
    discount: "0.00",
    discountCode: null,
    shippingCost: "0.00",
    tax: "0.00",
    total: "599.00",
    trackingNumber: null,
    paidAt: null,
    reservationExpiresAt: null,
    restockedAt: null,
    billingAddress: null,
    notes: null,
    items: [ITEM],
    guest: {
      name: "Олена Шевченко",
      email: "olena@example.com",
      phone: "+380501234567",
    },
    createdAt: "2026-10-06T09:00:00.000Z",
    updatedAt: "2026-10-06T09:00:00.000Z",
    ...overrides,
  };
}

async function mockGuestOrder(page: Page, order: Record<string, unknown>) {
  await page.route("**/api/orders/guest/*", (route) =>
    route.fulfill({ json: { data: order } }),
  );
}

const LOOKUP_BASE = {
  number: "33333333",
  createdAt: "2026-10-06T09:00:00.000Z",
  status: "PENDING",
  paymentStatus: "PENDING",
  paymentMethod: "ON_DELIVERY",
  items: [
    {
      productName: "Чохол MagSafe",
      quantity: 1,
      price: "599.00",
      lineTotal: "599.00",
      addons: [],
    },
  ],
  subtotal: "599.00",
  discount: "0.00",
  addonsTotal: "0.00",
  trackingNumber: null,
};

async function lookUp(page: Page, order: Record<string, unknown>) {
  await page.route("**/api/orders/lookup", (route) =>
    route.fulfill({ json: { data: [order] } }),
  );
  await page.goto("/orders/status");
  const main = page.getByRole("main");
  await main
    .getByRole("textbox", { name: "Номер замовлення" })
    .fill("33333333");
  await main.getByRole("textbox", { name: "Телефон" }).fill("+380501234567");
  await main.getByRole("button", { name: "Перевірити" }).click();
  return main.getByRole("region", { name: "Результат перевірки замовлення" });
}

test.describe("delivery after checkout (TASK-647)", () => {
  test("a guest's pickup order: the point, its hours, the map link, a free delivery", async ({
    page,
  }) => {
    await mockGuestOrder(
      page,
      guestOrder({
        deliveryMethod: "PICKUP",
        shippingAddress: {
          firstName: "Олена",
          lastName: "Шевченко",
          phone: "+380501234567",
          city: "Київ",
          address1: "вул. Хрещатик, 22",
          country: "UA",
          deliveryMethod: "PICKUP",
          carrier: null,
          pickupPointName: "Магазин на Хрещатику",
          pickupPointAddress: "вул. Хрещатик, 22",
          pickupPointHours: "Пн–Сб 10:00–20:00",
          pickupPointPhone: "+380441234567",
          pickupPointMapUrl: "https://maps.example/khreshchatyk",
        },
      }),
    );
    await page.goto("/orders/guest/test-token");

    const block = page.getByTestId("order-delivery");
    await expect(block).toContainText("Самовивіз · Магазин на Хрещатику");
    // Who collects it, and their phone in the UA mask (OrderConfirmation.dc.html).
    await expect(block).toContainText("Олена Шевченко");
    await expect(block).toContainText("+380 50 123 4567");
    await expect(block).toContainText("Київ, вул. Хрещатик, 22");
    await expect(block).toContainText("Пн–Сб 10:00–20:00 · +380441234567");
    await expect(
      block.getByRole("link", { name: /Як дістатися/ }),
    ).toHaveAttribute("href", "https://maps.example/khreshchatyk");
    await expect(block).toContainText(
      "Зателефонуємо, коли замовлення буде готове до видачі.",
    );
    // No separate billing block: the API stores none (TASK-1022).
    await expect(page.getByText("Адреса оплати")).toHaveCount(0);

    const totals = page.getByTestId("order-totals");
    await expect(totals).toContainText("Безкоштовно");
  });

  test("a guest's «інша доставка»: the operator will price it, never «0 ₴»", async ({
    page,
  }) => {
    await mockGuestOrder(
      page,
      guestOrder({
        deliveryMethod: "OTHER",
        shippingAddress: {
          firstName: "Олена",
          lastName: "Шевченко",
          phone: "+380501234567",
          city: "Ужгород",
          address1: "Укрпошта, індекс 88000, вул. Корзо, 5",
          country: "UA",
          deliveryMethod: "OTHER",
          carrier: null,
          shippingCostPending: true,
        },
      }),
    );
    await page.goto("/orders/guest/test-token");

    const block = page.getByTestId("order-delivery");
    await expect(block).toContainText("Інша доставка");
    await expect(block).toContainText("Укрпошта, індекс 88000, вул. Корзо, 5");
    await expect(block).toContainText(
      "Вартість доставки уточнить оператор, коли зателефонує підтвердити замовлення.",
    );

    const totals = page.getByTestId("order-totals");
    await expect(totals).toContainText("Уточнить оператор");
    await expect(totals).toContainText(
      "Без доставки — її вартість уточнить оператор",
    );
    await expect(totals).not.toContainText("Безкоштовно");
  });
});

test.describe("/orders/status names the real delivery method (TASK-1030)", () => {
  test("a pickup order reads «Самовивіз: <точка>, <адреса>» and is free", async ({
    page,
  }) => {
    const result = await lookUp(page, {
      ...LOOKUP_BASE,
      deliveryMethod: "PICKUP",
      shippingCost: "0.00",
      total: "599.00",
      delivery: {
        city: "Київ",
        warehouse: null,
        pickupPointName: "Магазин на Хрещатику",
        pickupPointAddress: "вул. Хрещатик, 22",
        shippingCostPending: false,
      },
    });

    await expect(result).toContainText(
      "Самовивіз: Магазин на Хрещатику, вул. Хрещатик, 22",
    );
    await expect(result).toContainText("Безкоштовно");
    await expect(result).not.toContainText("Кур");
  });

  test("an «інша доставка» order says the operator will price it", async ({
    page,
  }) => {
    const result = await lookUp(page, {
      ...LOOKUP_BASE,
      deliveryMethod: "OTHER",
      shippingCost: "0.00",
      total: "599.00",
      delivery: {
        city: "Ужгород",
        warehouse: null,
        pickupPointName: null,
        pickupPointAddress: null,
        shippingCostPending: true,
      },
    });

    await expect(result).toContainText(
      "Інший спосіб — вартість уточнить оператор",
    );
    await expect(result).toContainText("Уточнить оператор");
    await expect(result).not.toContainText("Безкоштовно");
  });
});
