import type { Page, Request, Route } from "@playwright/test";
import { test, expect } from "./fixtures/test";
import { addSeededProductToCart } from "./fixtures/cart";

/**
 * An account in checkout (TASK-2010, B-12 тема 2) — the guest with a promo code,
 * end to end in a real browser.
 *
 * A guest applies a code; the storefront ticks «Створити акаунт на цю пошту»
 * for it (a code holds only on an account's order), sends
 * `contact.createAccount: true`, stores the session the order comes back with,
 * and lands on the ACCOUNT's confirmation page — not the guest token page.
 *
 * What is under test is the storefront, so the API calls with a server-side
 * outcome are mocked, as in `checkout-delivery.spec.ts`: the delivery offer
 * (a pickup point, no Nova Poshta directory), the promo preview, the e-mail
 * hint, and `POST /orders` answering with `session`. Everything the new
 * session then asks for carries a bearer the real API never issued, so those
 * requests are answered here too. The server's half of the contract — the
 * account in the order's transaction, the cookie, the 409 / 400 codes — is the
 * store-api e2e suite's.
 */

const ORDER_ID = "33333333-3333-4333-8333-333333333333";
const EMAIL = "new-shopper@example.com";

/** A JWT-shaped token: the storefront only decodes it for `sub` and `role`. */
const SESSION_TOKEN = [
  { alg: "none", typ: "JWT" },
  { sub: "e2e-new-account", role: "CUSTOMER" },
]
  .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
  .concat("signature")
  .join(".");

const PICKUP_POINT = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Магазин на Хрещатику",
  city: "Київ",
  address: "вул. Хрещатик, 22",
  phone: "+380441234567",
  workingHours: "Пн–Сб 10:00–20:00",
  mapUrl: null,
};

const METHODS = {
  methods: ["PICKUP"],
  courier: { price: "150.00", freeFrom: "2000.00", cityName: "Київ" },
  pickupPoints: [PICKUP_POINT],
  paymentMatrix: {
    NOVA_POSHTA: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
    PICKUP: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
    COURIER: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
    OTHER: ["ON_DELIVERY"],
  },
};

const ORDER = {
  id: ORDER_ID,
  userId: "e2e-new-account",
  status: "PENDING",
  paymentStatus: "PENDING",
  paymentMethod: "ON_DELIVERY",
  deliveryMethod: "PICKUP",
  pickupPointId: PICKUP_POINT.id,
  paidAt: null,
  reservationExpiresAt: null,
  subtotal: "499.00",
  addonsTotal: "0.00",
  discount: "49.90",
  discountCode: "WELCOME10",
  shippingCost: "0.00",
  tax: "0.00",
  total: "449.10",
  trackingNumber: null,
  shippingAddress: {
    firstName: "Олена",
    lastName: "Шевченко",
    phone: "+380501234567",
    city: "Київ",
    address1: "вул. Хрещатик, 22",
    country: "UA",
  },
  billingAddress: null,
  notes: null,
  items: [],
  restockedAt: null,
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
};

/**
 * Answer every request that carries the new session's bearer. The real API
 * would read the made-up token as a 401 and the storefront would sign the
 * shopper straight back out — which is not what this test is about.
 */
async function serveTheNewSession(page: Page) {
  await page.route("**/api/**", (route: Route) => {
    const request = route.request();
    if (request.headers()["authorization"] !== `Bearer ${SESSION_TOKEN}`) {
      return route.fallback();
    }
    const path = new URL(request.url()).pathname;
    if (path === `/api/orders/${ORDER_ID}`) {
      return route.fulfill({ json: { data: ORDER } });
    }
    if (path === "/api/users/me") {
      return route.fulfill({
        json: {
          data: {
            id: "e2e-new-account",
            email: EMAIL,
            firstName: "Олена",
            lastName: "Шевченко",
            phone: "+380501234567",
            role: "CUSTOMER",
            isActive: true,
            emailVerifiedAt: null,
            lockedUntil: null,
            failedLoginAttempts: 0,
            createdAt: "2026-11-01T10:00:00.000Z",
            updatedAt: "2026-11-01T10:00:00.000Z",
          },
        },
      });
    }
    if (path.endsWith("/returns")) return route.fulfill({ json: { data: [] } });
    if (path.endsWith("/notifications/telegram")) {
      return route.fulfill({
        json: { data: { available: false, connected: false } },
      });
    }
    if (path === "/api/cart") {
      return route.fulfill({
        json: {
          data: {
            id: "cart-account",
            userId: "e2e-new-account",
            items: [],
            totals: {
              subtotal: "0.00",
              itemCount: 0,
              uniqueItems: 0,
              addonsTotal: "0.00",
            },
            createdAt: "2026-11-01T10:00:00.000Z",
            updatedAt: "2026-11-01T10:00:00.000Z",
          },
        },
      });
    }
    if (path === "/api/wishlist") {
      return route.fulfill({
        json: {
          data: {
            id: "wishlist-account",
            userId: "e2e-new-account",
            items: [],
            itemCount: 0,
            createdAt: "2026-11-01T10:00:00.000Z",
            updatedAt: "2026-11-01T10:00:00.000Z",
          },
        },
      });
    }
    return route.fulfill({ json: { data: null } });
  });
}

/** Mock the guest-side calls and capture the create-order request. */
async function mockGuestCheckout(page: Page): Promise<() => Promise<Request>> {
  await page.route("**/api/delivery/methods", (route) =>
    route.fulfill({ json: { data: METHODS } }),
  );
  await page.route("**/api/cart/discount/preview", (route) =>
    route.fulfill({
      json: {
        data: {
          code: "WELCOME10",
          type: "PERCENT",
          amount: "49.90",
          newTotal: "449.10",
          requiresAccount: true,
        },
      },
    }),
  );
  await page.route("**/api/auth/checkout/email-status", (route) =>
    route.fulfill({ json: { data: { hasAccount: false } } }),
  );
  await page.route("**/api/orders", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return route.fulfill({
      status: 201,
      json: { data: { ...ORDER, session: { accessToken: SESSION_TOKEN } } },
    });
  });
  return () =>
    page.waitForRequest(
      (request) =>
        request.method() === "POST" && /\/api\/orders$/.test(request.url()),
    );
}

test.describe("an account in checkout (TASK-2010)", () => {
  test("a guest's promo code ticks «Створити акаунт», and the order lands in the new account", async ({
    page,
  }) => {
    await serveTheNewSession(page);
    const orderRequest = await mockGuestCheckout(page);
    await addSeededProductToCart(page);
    await page.goto("/checkout");

    const main = page.getByRole("main");
    const box = main.getByRole("checkbox", {
      name: "Створити акаунт на цю пошту",
    });
    await expect(box).not.toBeChecked();

    // The code, applied as a guest — no «увійдіть» detour any more.
    const summary = main.getByRole("complementary");
    await summary.getByLabel("Промокод").fill("welcome10");
    await summary.getByRole("button", { name: "Застосувати" }).click();
    await expect(summary).toContainText("Промокод «WELCOME10» застосовано");
    await expect(summary).toContainText(
      "Застосується з акаунтом — створимо його під час оформлення.",
    );

    // …and the box ticks itself, saying why.
    await expect(box).toBeChecked();
    await expect(main).toContainText(
      "Промокод діє лише з акаунтом — тож створимо його на цю пошту.",
    );

    await main.locator("#checkout-email").fill(EMAIL);
    await main.getByLabel("Ім'я", { exact: true }).fill("Олена");
    await main.getByLabel("Прізвище", { exact: true }).fill("Шевченко");
    await main.locator("#checkout-phone").fill("+380501234567");

    const sent = orderRequest();
    await main.getByRole("button", { name: "Далі" }).click();
    await expect(
      main.getByRole("heading", { name: "Перевірте деталі замовлення" }),
    ).toBeVisible();
    await main.getByRole("checkbox", { name: "Я приймаю умови" }).check();
    await main.getByRole("button", { name: "Підтвердити замовлення" }).click();

    const body = (await sent).postDataJSON();
    expect(body).toMatchObject({
      discountCode: "WELCOME10",
      deliveryMethod: "PICKUP",
      contact: { email: EMAIL, createAccount: true },
    });

    // The account's own confirmation page, read with the new session — never
    // the guest token page.
    await expect(page).toHaveURL(
      new RegExp(`/orders/${ORDER_ID}/confirmation$`),
    );
    await expect(page.getByRole("main")).toContainText(
      ORDER_ID.slice(0, 8).toUpperCase(),
    );
  });
});
