import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib";
import { OrderDetailView } from "./order-detail-view";

// next/navigation is unavailable under jsdom — mock the router.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

function makeOrder(
  customer: unknown,
  overrides: {
    status?: string;
    restockedAt?: string | null;
    items?: Array<{ id: string; quantity: number }>;
  } = {},
) {
  return {
    id: "order-uuid-12345678",
    userId: "user-uuid-87654321",
    status: overrides.status ?? "PENDING",
    paymentStatus: "PENDING",
    subtotal: "29.99",
    discount: "0",
    shippingCost: "0",
    tax: "0",
    total: "29.99",
    shippingAddress: {
      firstName: "Olena",
      lastName: "Shevchenko",
      city: "Kyiv",
      phone: "+380501234567",
    },
    billingAddress: null,
    notes: null,
    items: overrides.items
      ? overrides.items.map((item) => ({
          id: item.id,
          productId: "prod-uuid-1",
          productName: "iPhone 15 Pro Case",
          price: "29.99",
          quantity: item.quantity,
          lineTotal: "29.99",
        }))
      : [
          {
            id: "item-1",
            productId: "prod-uuid-1",
            productName: "iPhone 15 Pro Case",
            price: "29.99",
            quantity: 1,
            lineTotal: "29.99",
          },
        ],
    customer,
    restockedAt: overrides.restockedAt ?? null,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
  };
}

describe("OrderDetailView — customer section (TASK-125)", () => {
  it("renders a Customer card with the account email and name", async () => {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({
          data: makeOrder({
            id: "user-uuid-87654321",
            email: "buyer@example.com",
            firstName: "Ivan",
            lastName: "Petrenko",
          }),
        }),
      ),
    );

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    expect(await screen.findByText(dict.orders.customer)).toBeInTheDocument();
    expect(screen.getByText("buyer@example.com")).toBeInTheDocument();
    expect(screen.getByText("Ivan Petrenko")).toBeInTheDocument();
    // Status badges render Ukrainian labels, not raw enums (TASK-129).
    expect(screen.getByText("Очікує підтвердження")).toBeInTheDocument();
    expect(screen.getByText("Очікує оплати")).toBeInTheDocument();
    expect(screen.queryByText("PENDING")).not.toBeInTheDocument();
  });

  it("omits the Customer card when no customer is present", async () => {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({ data: makeOrder(null) }),
      ),
    );

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    // Wait for the order to load (Summary always renders), then assert no card.
    expect(await screen.findByText(dict.orders.summary)).toBeInTheDocument();
    expect(screen.queryByText(dict.orders.customer)).not.toBeInTheDocument();
  });

  it("renders independent status and payment-status controls (TASK-151)", async () => {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({ data: makeOrder(null) }),
      ),
    );

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    // Two separate comboboxes: order status + payment status. The order-status
    // one waits on its own `allowed-transitions` read (TASK-332), so it is
    // awaited rather than asserted synchronously after the order lands.
    expect(
      await screen.findByRole("combobox", {
        name: dict.orderStatus.updateAria,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", {
        name: dict.orderStatus.paymentUpdateAria,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.orderStatus.updatePaymentStatus),
    ).toBeInTheDocument();
  });

  it("renders product name as a link to the product edit page (TASK-156)", async () => {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({ data: makeOrder(null) }),
      ),
    );

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    const link = await screen.findByRole("link", {
      name: dict.orders.viewProductAria("iPhone 15 Pro Case"),
    });
    expect(link).toHaveAttribute("href", "/products/prod-uuid-1/edit");
    expect(link).toHaveTextContent("iPhone 15 Pro Case");
  });
});

describe("OrderDetailView — stock-hold badges (TASK-254)", () => {
  it("shows a holds-stock badge with the summed quantity for a pre-shipment order", async () => {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({
          data: makeOrder(null, {
            status: "PENDING",
            restockedAt: null,
            items: [
              { id: "item-1", quantity: 2 },
              { id: "item-2", quantity: 3 },
            ],
          }),
        }),
      ),
    );

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    // 2 + 3 = 5 units held.
    expect(
      await screen.findByText(dict.orders.holdsStock(5)),
    ).toBeInTheDocument();
    // The restocked badge prefix must be absent.
    expect(screen.queryByText(/Залишок повернуто/)).not.toBeInTheDocument();
  });

  it("shows a restocked-at badge (not holds-stock) once a cancelled order was restocked", async () => {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({
          data: makeOrder(null, {
            status: "CANCELLED",
            restockedAt: "2026-06-01T14:30:00.000Z",
          }),
        }),
      ),
    );

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    await screen.findByText(dict.orders.summary);
    expect(screen.getByText(/Залишок повернуто/)).toBeInTheDocument();
    expect(screen.queryByText(/Тримає залишок/)).not.toBeInTheDocument();
  });

  it("shows neither badge for a delivered order", async () => {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({
          data: makeOrder(null, { status: "DELIVERED", restockedAt: null }),
        }),
      ),
    );

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    await screen.findByText(dict.orders.summary);
    expect(screen.queryByText(/Тримає залишок/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Залишок повернуто/)).not.toBeInTheDocument();
  });
});

/**
 * TASK-425 — what the order actually contains.
 *
 * The API had been sending the per-line add-ons, the add-on total, the promo
 * code and the guest contact block all along; the page rendered none of them.
 * The visible symptom was arithmetic: the summary column could not reach the
 * total, because the add-ons are inside `total` and were in none of the rows
 * above it.
 */
describe("OrderDetailView — the summary adds up (TASK-425)", () => {
  /**
   * Real numbers, and the same invariant the backend holds:
   *   total = subtotal + addonsTotal + shipping + tax - discount
   *   1469  = 1000     + 499         + 70       + 0   - 100
   */
  const moneyOrder = {
    ...makeOrder(null),
    subtotal: "1000.00",
    discount: "100.00",
    discountCode: "SUMMER10",
    addonsTotal: "499.00",
    shippingCost: "70.00",
    tax: "0.00",
    total: "1469.00",
    items: [
      {
        id: "item-1",
        productId: "prod-uuid-1",
        productName: "iPhone 15 Pro Case",
        price: "1000.00",
        quantity: 1,
        // Deliberately EXCLUDES the add-on (order-item.entity.ts): the line is
        // price × quantity, the add-ons are summed on the order.
        lineTotal: "1000.00",
        addons: [
          {
            id: "addon-1",
            addonServiceId: "svc-1",
            name: "Захисне скло",
            price: "499.00",
          },
        ],
      },
    ],
  };

  /**
   * Read a rendered money row back as a number. `formatCurrency` is uk-UA, so
   * the output is "1 000 ₴" / "29,99 ₴" with non-breaking spaces — this undoes
   * exactly that, and nothing else.
   */
  const parseMoney = (text: string): number =>
    Number(
      text
        .replace(/[^\d,.-]/g, "")
        .replace(/\s/g, "")
        .replace(",", "."),
    );

  const rowValue = (label: string): number => {
    const valueNode = screen.getByText(label).nextElementSibling;
    return parseMoney(valueNode?.textContent ?? "");
  };

  beforeEach(() => {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({ data: moneyOrder }),
      ),
    );
  });

  it("renders an add-ons row, and the rows on screen sum to the total", async () => {
    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    expect(await screen.findByText(dict.orders.summary)).toBeInTheDocument();

    const subtotal = rowValue(dict.orders.subtotal);
    const addons = rowValue(dict.orders.addonsTotal);
    const shipping = rowValue(dict.orders.shipping);
    const tax = rowValue(dict.orders.tax);
    const discount = rowValue(
      dict.orders.discountWithCode(moneyOrder.discountCode),
    );
    const total = rowValue(dict.orders.total);

    expect(subtotal).toBe(1000);
    expect(addons).toBe(499);
    expect(discount).toBe(100);
    expect(total).toBe(1469);
    // The actual complaint: before the add-ons row this column came to 970 and
    // the total said 1469, with nothing on screen explaining the 499.
    expect(subtotal + addons + shipping + tax - discount).toBe(total);
  });

  it("names the promo code beside the discount", async () => {
    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    // A discount an operator cannot name is one they cannot explain on the phone.
    expect(
      await screen.findByText(dict.orders.discountWithCode("SUMMER10")),
    ).toBeInTheDocument();
  });

  it("shows each add-on under its line without touching the line total", async () => {
    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    expect(await screen.findByText(/Захисне скло/)).toBeInTheDocument();
    expect(screen.getByText(dict.orders.addonsHint)).toBeInTheDocument();
  });

  it("hides the add-ons row for an order that has none", async () => {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({
          data: { ...moneyOrder, addonsTotal: "0.00", items: [] },
        }),
      ),
    );

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    expect(await screen.findByText(dict.orders.summary)).toBeInTheDocument();
    // Zero add-ons, zero row: such an order adds up without it, and a permanent
    // "0 ₴" line is noise on every order the shop has ever taken.
    expect(screen.queryByText(dict.orders.addonsTotal)).not.toBeInTheDocument();
    expect(screen.queryByText(dict.orders.addonsHint)).not.toBeInTheDocument();
  });
});

describe("OrderDetailView — guest orders have a customer too (TASK-425)", () => {
  it("renders a customer card for a guest order, badged as such", async () => {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({
          data: {
            ...makeOrder(null),
            userId: null,
            guest: {
              email: "olena@example.com",
              phone: "+380501112233",
              name: "Олена Шевченко",
            },
          },
        }),
      ),
    );

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    // Before TASK-425 this page rendered NO customer card at all for a guest
    // order — the one case where the contact typed at checkout is the only way
    // to reach the buyer.
    expect(await screen.findByText(dict.orders.customer)).toBeInTheDocument();
    expect(screen.getByText("olena@example.com")).toBeInTheDocument();
    expect(screen.getByText("Олена Шевченко")).toBeInTheDocument();
    expect(screen.getByText("+380501112233")).toBeInTheDocument();
    expect(screen.getByText(dict.orders.customerTypeGuest)).toBeInTheDocument();
    expect(
      screen.queryByText(dict.orders.customerTypeAccount),
    ).not.toBeInTheDocument();
  });

  it("shows the phone when the operator's order has no email (TASK-426)", async () => {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({
          data: {
            ...makeOrder(null),
            userId: null,
            // Exactly what the API returns for an order taken over the phone:
            // `ManualOrderContactDto` makes the email optional, so it is null.
            // The entity used to gate the whole guest block on that email, so
            // this page rendered no customer card at all and the number the
            // operator had just typed was nowhere on the screen they work from.
            guest: {
              email: null,
              phone: "+380671112233",
              name: "Олена Шевченко",
            },
          },
        }),
      ),
    );

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    expect(await screen.findByText(dict.orders.customer)).toBeInTheDocument();
    const phone = screen.getByText("+380671112233");
    expect(phone).toBeInTheDocument();
    expect(screen.getByText("Олена Шевченко")).toBeInTheDocument();
    expect(screen.getByText(dict.orders.customerTypeGuest)).toBeInTheDocument();
    // Name and phone and NOTHING else: the missing email must not leave an
    // empty row above them. Counted rather than read, because an empty <div>
    // contributes nothing to textContent and so hides from every text query —
    // which is why it survived review in the first place.
    expect(phone.parentElement?.childElementCount).toBe(2);
  });

  it("badges an account order as an account", async () => {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({
          data: makeOrder({
            id: "user-uuid-87654321",
            email: "buyer@example.com",
            firstName: "Ivan",
            lastName: "Petrenko",
          }),
        }),
      ),
    );

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    expect(
      await screen.findByText(dict.orders.customerTypeAccount),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(dict.orders.customerTypeGuest),
    ).not.toBeInTheDocument();
  });
});

// ── "Повернуто X з Y" (TASK-472) ──────────────────────────────────────────────
// The fifth derived mark of B-1. It is a fraction, so it is only meaningful in
// the one payment status that means "some of it": the tests below pin both
// halves — that it appears at PARTIALLY_REFUNDED and that it appears nowhere
// else — because a mark that shows up on a fully refunded order is worse than
// no mark at all.
describe("OrderDetailView — partial-refund sum (TASK-472)", () => {
  function servePartialRefund(
    overrides: { paymentStatus?: string; refundedTotal?: string } = {},
  ) {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({
          data: {
            ...makeOrder(null),
            paymentStatus: overrides.paymentStatus ?? "PARTIALLY_REFUNDED",
            ...(overrides.refundedTotal === undefined
              ? { refundedTotal: "10.00" }
              : { refundedTotal: overrides.refundedTotal }),
          },
        }),
      ),
    );
  }

  it("shows the refunded sum against the order total", async () => {
    servePartialRefund();

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    expect(
      await screen.findByText(dict.orders.refundedLabel),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        dict.orders.refundedOfTotal(
          formatCurrency("10.00"),
          formatCurrency("29.99"),
        ),
        // `formatCurrency` puts a non-breaking space before the ₴, and the
        // default normalizer turns that into a plain space in the DOM text while
        // leaving it intact in the expected string — so the two never match.
        // Trim only.
        { normalizer: (text) => text.trim() },
      ),
    ).toBeInTheDocument();
  });

  it("stays hidden on a fully refunded order", async () => {
    servePartialRefund({ paymentStatus: "REFUNDED", refundedTotal: "29.99" });

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    // Anchored on the payment card's heading, not on its "Сума" row: that word
    // is also a column header in the items table below.
    expect(
      await screen.findByText(dict.orders.paymentHeading),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(dict.orders.refundedLabel),
    ).not.toBeInTheDocument();
  });

  it("stays hidden when the response carried no sum at all", async () => {
    // `refundedTotal` is absent — not "0.00" — whenever the returns were not
    // joined. Rendering "Повернуто 0,00 ₴ з 29,99 ₴" there would be an invented
    // fact, so the row is simply not drawn.
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({
          data: { ...makeOrder(null), paymentStatus: "PARTIALLY_REFUNDED" },
        }),
      ),
    );

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    // Anchored on the payment card's heading, not on its "Сума" row: that word
    // is also a column header in the items table below.
    expect(
      await screen.findByText(dict.orders.paymentHeading),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(dict.orders.refundedLabel),
    ).not.toBeInTheDocument();
  });
});
