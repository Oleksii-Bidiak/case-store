import { http, HttpResponse } from "msw";
import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
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
    // The payment badge stands in the header AND on the payment card (К1).
    expect(screen.getAllByText("Очікує оплати").length).toBeGreaterThan(0);
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
    expect(
      await screen.findByText(dict.orders.itemsHeading),
    ).toBeInTheDocument();
    expect(screen.queryByText(dict.orders.customer)).not.toBeInTheDocument();
  });

  it("renders independent status and payment-status controls (TASK-151)", async () => {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({ data: makeOrder(null) }),
      ),
    );

    // TASK-715: both controls need `orders:write`.
    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />, {
      auth: { permissions: ["orders:read", "orders:write"] },
    });

    // Two separate comboboxes: order status + payment status. The order-status
    // one waits on its own `allowed-transitions` read (TASK-332), so it is
    // awaited rather than asserted synchronously after the order lands.
    expect(
      await screen.findByRole("button", { name: dict.orders.updateStatus }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("combobox", {
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

    await screen.findByText(dict.orders.itemsHeading);
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

    await screen.findByText(dict.orders.itemsHeading);
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

  // Within the totals: «Доставка» is also the delivery block's title (TASK-648).
  const rowValue = (label: string): number => {
    const valueNode = within(
      screen.getByRole("group", { name: dict.orders.summary }),
    ).getByText(label).nextElementSibling;
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

    expect(
      await screen.findByText(dict.orders.itemsHeading),
    ).toBeInTheDocument();

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

    expect(
      await screen.findByText(dict.orders.itemsHeading),
    ).toBeInTheDocument();
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
    expect(screen.getByText("+380 50 111 2233")).toBeInTheDocument();
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
    const phone = screen.getByText("+380 67 111 2233");
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

// ── The buyer's link is for guest orders only (TASK-623) ─────────────────────
// The API answers 409 for any order with a `userId`, so the page must decide by
// `userId` — never by the `guest` block, which a claimed guest order still has.
describe("OrderDetailView — customer link only on guest orders (TASK-623)", () => {
  const GUEST = {
    email: "olena@example.com",
    phone: "+380501112233",
    name: "Олена Шевченко",
  };

  function serve(data: unknown) {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({ data }),
      ),
    );
  }

  function renderAsWriter() {
    return renderWithProviders(
      <OrderDetailView orderId="order-uuid-12345678" />,
      { auth: { permissions: ["orders:read", "orders:write"] } },
    );
  }

  it("offers the issue button on a guest order", async () => {
    serve({ ...makeOrder(null), userId: null, guest: GUEST });
    renderAsWriter();

    expect(
      await screen.findByRole("button", { name: dict.orderAccess.issue }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(dict.orderAccess.accountOrderHint),
    ).not.toBeInTheDocument();
  });

  it("hides the button on an account order and says why", async () => {
    serve(
      makeOrder({
        id: "user-uuid-87654321",
        email: "buyer@example.com",
        firstName: "Ivan",
        lastName: "Petrenko",
      }),
    );
    renderAsWriter();

    expect(
      await screen.findByText(dict.orderAccess.accountOrderHint),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.orderAccess.issue }),
    ).not.toBeInTheDocument();
  });

  it("hides the button on a claimed guest order that still carries its guest block", async () => {
    // userId set AND guest snapshot present — the API refuses this one too.
    serve({ ...makeOrder(null), userId: "user-uuid-87654321", guest: GUEST });
    renderAsWriter();

    expect(
      await screen.findByText(dict.orderAccess.accountOrderHint),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.orderAccess.issue }),
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

/**
 * The derived marks on the order card (TASK-470 / 471 / 472).
 *
 * The card and the list compute them with the same function, so the conditions
 * themselves are pinned in `order-marks.test.ts`. What is pinned HERE is that
 * they reach the two places on this page where an operator actually looks: the
 * header, beside the status, and the line of the item that has gone.
 *
 * «Позиція недоступна» is the one mark the client cannot derive — only the
 * server can see whether the catalogue row was deleted, unpublished or oversold
 * — so it arrives as `unavailableItemIds`, and its ABSENCE has to mean "not
 * measured" rather than "all fine".
 */
describe("OrderDetailView — the derived marks of B-1 (TASK-470/471/472)", () => {
  const stub = (order: Record<string, unknown>) =>
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({ data: { ...makeOrder(null), ...order } }),
      ),
    );

  it("shows «Борг» in the header of a delivered, unpaid order", async () => {
    stub({ status: "DELIVERED", paymentStatus: "PENDING", total: "1200.00" });

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    expect(await screen.findByText(/Борг\s/)).toHaveTextContent(/1\s?200/);
  });

  it("counts down the payment window of a card order", async () => {
    stub({
      paymentMethod: "ONLINE",
      paymentStatus: "PENDING",
      reservationExpiresAt: new Date(Date.now() + 17 * 60_000).toISOString(),
    });

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    expect(
      await screen.findByText(/Очікує оплати · \d+ хв/),
    ).toBeInTheDocument();
  });

  it("marks the line the server says can no longer be supplied", async () => {
    stub({ unavailableItemIds: ["item-1"] });

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    expect(
      await screen.findByText(dict.orders.markItemUnavailable),
    ).toBeInTheDocument();
  });

  it("leaves a line unmarked when the server measured it and found it fine", async () => {
    stub({ unavailableItemIds: [] });

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    await screen.findByText("iPhone 15 Pro Case");
    expect(
      screen.queryByText(dict.orders.markItemUnavailable),
    ).not.toBeInTheDocument();
  });

  it("leaves a line unmarked when the response never measured availability", async () => {
    // `unavailableItemIds` absent, not empty. The card must not invent an answer
    // — and must not blank out either.
    stub({});

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    await screen.findByText("iPhone 15 Pro Case");
    expect(
      screen.queryByText(dict.orders.markItemUnavailable),
    ).not.toBeInTheDocument();
  });

  it("does not mark a line the order does not name", async () => {
    stub({ unavailableItemIds: ["some-other-line"] });

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    await screen.findByText("iPhone 15 Pro Case");
    expect(
      screen.queryByText(dict.orders.markItemUnavailable),
    ).not.toBeInTheDocument();
  });
});

/**
 * TASK-715 — a manager holding `orders:read` but not `orders:write`.
 *
 * Every control on the card writes through an `orders:write` endpoint, so each
 * one used to be a 403 with a toast that blamed "somebody else" (AD-ORD-34).
 * The rule of the wave: such controls are ABSENT, not disabled — and where the
 * status control stood, one line says the card is read-only on purpose.
 */
describe("OrderDetailView — read-only without orders:write (TASK-715)", () => {
  function serve() {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({
          data: {
            ...makeOrder(null),
            trackingNumber: "59000000000000",
            internalNotes: "Передзвонити",
          },
        }),
      ),
    );
  }

  it("shows no control that changes the order to a reader", async () => {
    serve();
    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />, {
      auth: { permissions: ["orders:read"] },
    });

    expect(await screen.findByText(dict.common.viewOnly)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(
      screen.queryByText(dict.orders.updateStatus),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(dict.orderStatus.updatePaymentStatus),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.orders.addressEdit }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.orders.detailsSave }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    // What the reader came for is still there, as text.
    expect(screen.getByText("59000000000000")).toBeInTheDocument();
    expect(screen.getByText("Передзвонити")).toBeInTheDocument();
    expect(screen.getByText("Kyiv")).toBeInTheDocument();
  });

  it("gives a writer the address edit and no read-only line", async () => {
    serve();
    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />, {
      auth: { permissions: ["orders:read", "orders:write"] },
    });

    expect(
      await screen.findByRole("button", { name: dict.orders.addressEdit }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(dict.orders.updateStatus),
    ).toBeInTheDocument();
    expect(screen.queryByText(dict.common.viewOnly)).not.toBeInTheDocument();
  });

  // Until the grant set arrives `can()` is false for everyone, the owner
  // included; reading that as "read-only" flashed the line at every writer.
  it("shows neither the controls nor the read-only line while rights load", async () => {
    serve();
    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />, {
      auth: { permissions: [], arePermissionsLoading: true },
    });

    expect(await screen.findByText("Kyiv")).toBeInTheDocument();
    expect(screen.queryByText(dict.common.viewOnly)).not.toBeInTheDocument();
    expect(
      screen.queryByText(dict.orders.updateStatus),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(dict.orderStatus.updatePaymentStatus),
    ).not.toBeInTheDocument();
    // The waybill block waits too — neither its text view nor its inputs.
    expect(screen.queryByText("59000000000000")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

/** TASK-724 — the card shows the order's returns to whoever may read them. */
describe("OrderDetailView — returns on the card (TASK-724)", () => {
  function serve() {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({ data: makeOrder(null, { status: "DELIVERED" }) }),
      ),
      http.get("*/api/admin/orders/:orderId/returns", () =>
        HttpResponse.json({
          data: [
            {
              id: "ret00001-aaaa",
              orderId: "order-uuid-12345678",
              status: "REQUESTED",
              reason: null,
              requestedAt: "2026-09-01T10:00:00.000Z",
              resolvedAt: null,
              restockedAt: null,
              refundedAmount: null,
              createdByUserId: "user-uuid-87654321",
              items: [],
            },
          ],
        }),
      ),
    );
  }

  it("links each return from the card for a session with returns:read", async () => {
    serve();
    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />, {
      auth: { permissions: ["orders:read", "returns:read"] },
    });

    expect(
      await screen.findByRole("link", {
        name: dict.returns.title("RET00001"),
      }),
    ).toHaveAttribute("href", "/returns/ret00001-aaaa");
  });

  it("has no returns section without returns:read", async () => {
    serve();
    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />, {
      auth: { permissions: ["orders:read"] },
    });

    await screen.findByText(dict.orders.itemsHeading);
    expect(
      screen.queryByRole("heading", { name: dict.orders.returnsForOrder }),
    ).not.toBeInTheDocument();
  });
});

/**
 * TASK-629: «Очікує оплати · N хв» used to freeze at the fetch — the card read
 * the panel-default 5-minute `staleTime` and nothing re-rendered on a clock. Now
 * a one-minute tick moves the count and the card refetches once a minute.
 */
describe("OrderDetailView — the awaiting-payment countdown (TASK-629)", () => {
  const START = Date.parse("2026-09-26T10:00:00.000Z");

  beforeEach(() => {
    // Promises and MSW must still run; only the clocks are faked.
    jest.useFakeTimers({
      now: START,
      doNotFake: ["queueMicrotask", "nextTick", "setImmediate"],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function awaitingOrder(overrides: Record<string, unknown> = {}) {
    return {
      ...makeOrder(null),
      paymentMethod: "ONLINE",
      paymentStatus: "PENDING",
      reservationExpiresAt: new Date(START + 10 * 60_000).toISOString(),
      trackingNumber: null,
      internalNotes: "стара примітка",
      ...overrides,
    };
  }

  it("counts the minutes down without a reload, and refetches the order", async () => {
    let reads = 0;
    server.use(
      http.get("*/api/admin/orders/:orderId", () => {
        reads += 1;
        return HttpResponse.json({ data: awaitingOrder() });
      }),
    );

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    expect(
      await screen.findByText(dict.orders.markAwaitingPayment(10)),
    ).toBeInTheDocument();
    expect(reads).toBe(1);

    await act(async () => {
      jest.advanceTimersByTime(3 * 60_000);
    });

    expect(
      await screen.findByText(dict.orders.markAwaitingPayment(7)),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(dict.orders.markAwaitingPayment(10)),
    ).not.toBeInTheDocument();
    // The card polls on its own (refetchInterval), not only on focus.
    await waitFor(() => expect(reads).toBeGreaterThan(1));

    // And the countdown ends where the worker would act.
    await act(async () => {
      jest.advanceTimersByTime(8 * 60_000);
    });
    expect(
      await screen.findByText(dict.orders.markReservationExpired),
    ).toBeInTheDocument();
  });

  it("does not wipe a half-typed waybill when the periodic refetch lands", async () => {
    let notes = "стара примітка";
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({ data: awaitingOrder({ internalNotes: notes }) }),
      ),
    );

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />, {
      auth: { permissions: ["orders:read", "orders:write"] },
    });

    const waybill = await screen.findByLabelText(dict.orders.trackingNumber);
    fireEvent.change(waybill, { target: { value: "20450000000000" } });

    // A colleague edits the notes; the next poll brings that in.
    notes = "примітка колеги";
    await act(async () => {
      jest.advanceTimersByTime(61_000);
    });

    await waitFor(() =>
      expect(screen.getByLabelText(dict.orders.internalNotes)).toHaveValue(
        "примітка колеги",
      ),
    );
    // forms.md Rule 2a: the dirty field survives the refetch.
    expect(screen.getByLabelText(dict.orders.trackingNumber)).toHaveValue(
      "20450000000000",
    );
  });
});

/** Wave 198 (TASK-1046, OrdersProposal К1–К4): the card's new frame. */
describe("OrderDetailView — the card by mockup (TASK-1046)", () => {
  function serve(order: Record<string, unknown> = {}) {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({ data: { ...makeOrder(null), ...order } }),
      ),
    );
  }

  it("names the order «Замовлення #XXXXXXXX» with a copy button and the way back", async () => {
    serve();
    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    expect(
      await screen.findByRole("heading", { name: "Замовлення #ORDER-UU" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.orders.rowCopyNumber }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: dict.orders.back }),
    ).toHaveAttribute("href", "/orders");
  });

  it("draws the order path with the current step and the time each was reached", async () => {
    serve({ status: "CONFIRMED" });
    server.use(
      http.get("*/api/admin/orders/:orderId/history", () =>
        HttpResponse.json({
          data: [
            {
              id: "h-1",
              orderId: "order-uuid-12345678",
              changeType: "STATUS",
              fromStatus: "PENDING",
              toStatus: "CONFIRMED",
              fromPaymentStatus: null,
              toPaymentStatus: null,
              changedBy: null,
              note: null,
              rejectedPaymentStatus: null,
              changedAt: "2026-06-01T10:31:00.000Z",
            },
          ],
        }),
      ),
    );
    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    const path = await screen.findByRole("list", {
      name: dict.orders.stepsAria,
    });
    const states = () =>
      Array.from(path.querySelectorAll("li")).map((step) =>
        step.getAttribute("data-state"),
      );
    expect(states()).toEqual(["done", "now", "todo", "todo", "todo"]);
    // 10:31 UTC is 13:31 in Kyiv.
    await waitFor(() =>
      expect(path.querySelectorAll("li")[1]).toHaveTextContent("13:31"),
    );
  });

  it("leads unpaid cash on delivery with «Гроші від НП отримано» — the move to PAID", async () => {
    serve({ paymentMethod: "ON_DELIVERY", paymentStatus: "PENDING" });
    server.use(
      http.get("*/api/admin/orders/:orderId/allowed-payment-transitions", () =>
        HttpResponse.json({
          data: { current: "PENDING", allowed: ["PAID", "FAILED"] },
        }),
      ),
    );
    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />, {
      auth: { permissions: ["orders:read", "orders:write"] },
    });

    expect(
      await screen.findByRole("button", {
        name: dict.orderStatus.codReceived,
      }),
    ).toBeInTheDocument();
    // The full list stays, as «Інший статус оплати».
    expect(
      screen.getByText(dict.orderStatus.otherPaymentStatus),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", {
        name: dict.orderStatus.paymentUpdateAria,
      }),
    ).toBeInTheDocument();
  });

  it("offers the buyer-link shortcut in «⋯» on a guest order", async () => {
    serve({
      userId: null,
      guest: { email: null, phone: "+380501112233", name: "Олена" },
    });
    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />, {
      auth: { permissions: ["orders:read"] },
    });

    await userEvent.click(
      await screen.findByRole("button", { name: dict.orders.moreActionsAria }),
    );
    expect(
      await screen.findByRole("menuitem", {
        name: dict.orders.accessLinkAction,
      }),
    ).toHaveAttribute("href", "#order-access-link");
  });

  it("is the anchor the list's «Змінити статус…» lands on", async () => {
    serve();
    const { container } = renderWithProviders(
      <OrderDetailView orderId="order-uuid-12345678" />,
    );
    await screen.findByText(dict.orders.itemsHeading);
    expect(container.querySelector("#order-status")).not.toBeNull();
  });
});
