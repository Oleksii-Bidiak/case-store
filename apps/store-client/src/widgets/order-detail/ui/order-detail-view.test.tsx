import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeOrder, makeOrderItem } from "@/shared/test/msw-handlers";
import type { OrderEntity } from "@/entities/order";
import { dict } from "@/shared/config";
import { formatTime } from "@/shared/lib";
import { OrderDetailView } from "./order-detail-view";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
  usePathname: () => "/account/orders/order-1",
}));

const authed = {
  auth: { isAuthenticated: true, accessToken: "token" },
} as const;

const d = dict.order.detail;
const pay = dict.order.payment;

function serve(overrides: Partial<OrderEntity> = {}) {
  server.use(
    http.get("*/api/orders/:id", () => HttpResponse.json(makeOrder(overrides))),
  );
}

async function renderDetail(overrides: Partial<OrderEntity> = {}) {
  serve(overrides);
  const view = renderWithProviders(
    <OrderDetailView orderId="order-1" />,
    authed,
  );
  await screen.findByRole("heading", {
    level: 1,
    name: dict.account.dashboard.orderHeading("ORDER-1"),
  });
  return view;
}

/** Filled (`default`) buttons — the screen may hold at most one. */
const primaries = (container: HTMLElement) =>
  container.querySelectorAll('[data-slot="button"][data-variant="default"]');

const panel = () => screen.queryByTestId("order-payment-panel");
const totals = () => within(screen.getByTestId("order-totals"));

describe("OrderDetailView (TASK-217)", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("links back to the order history and names the order in the h1", async () => {
    await renderDetail({ status: "SHIPPED" });
    expect(
      screen.getByRole("link", { name: dict.account.dashboard.nav.orders }),
    ).toHaveAttribute("href", "/account/orders");
    expect(
      screen.getByText(d.placedOn("1 червня 2026"), { exact: false }),
    ).toBeInTheDocument();
  });

  it("links every product name to its PDP and counts units, not lines", async () => {
    await renderDetail({
      items: [
        makeOrderItem({
          id: "i1",
          productName: "Кабель",
          productSlug: "cable",
          quantity: 2,
        }),
        makeOrderItem({
          id: "i2",
          productName: "Чохол",
          productSlug: "case",
          quantity: 1,
        }),
      ],
    });
    expect(screen.getByRole("link", { name: "Кабель" })).toHaveAttribute(
      "href",
      "/products/cable",
    );
    expect(screen.getByRole("link", { name: "Чохол" })).toHaveAttribute(
      "href",
      "/products/case",
    );
    expect(screen.getByTestId("order-detail-items")).toHaveTextContent(
      dict.orderHistory.itemCount(3),
    );
  });

  describe("timeline", () => {
    it("draws the four stages for an open order", async () => {
      await renderDetail({ status: "SHIPPED" });
      const list = screen.getByRole("list", { name: d.stepsAria });
      const items = within(list).getAllByRole("listitem");
      expect(items).toHaveLength(4);
      expect(
        items.filter((item) => item.getAttribute("data-state") === "done"),
      ).toHaveLength(2);
      expect(items[2]).toHaveAttribute("aria-current", "step");
      expect(screen.queryByTestId("order-closed-strip")).toBeNull();
    });

    it("replaces the timeline with a strip on a cancelled order", async () => {
      await renderDetail({
        status: "CANCELLED",
        paymentStatus: "REFUNDED",
        paymentMethod: "ONLINE",
      });
      expect(screen.queryByRole("list", { name: d.stepsAria })).toBeNull();
      expect(screen.getByTestId("order-closed-strip")).toHaveTextContent(
        d.closedCancelled,
      );
      expect(panel()).toHaveTextContent(pay.refundedTitle);
    });

    it("drops the strip when the panel already says «Замовлення скасовано»", async () => {
      await renderDetail({
        status: "CANCELLED",
        paymentStatus: "PENDING",
        paymentMethod: "ONLINE",
      });
      expect(panel()).toHaveTextContent(pay.orderCancelledTitle);
      expect(screen.queryByTestId("order-closed-strip")).toBeNull();
    });

    it("keeps the strip for a cancelled cash-on-delivery order (no panel)", async () => {
      await renderDetail({ status: "CANCELLED", paymentMethod: "ON_DELIVERY" });
      expect(panel()).toBeNull();
      expect(screen.getByTestId("order-closed-strip")).toBeInTheDocument();
    });
  });

  describe("payment panel", () => {
    it("paid — «Оплату отримано», no button", async () => {
      const { container } = await renderDetail({
        status: "SHIPPED",
        paymentStatus: "PAID",
        paymentMethod: "ONLINE",
      });
      expect(panel()).toHaveTextContent(pay.paidTitle);
      expect(panel()).toHaveTextContent(pay.paidBody);
      expect(primaries(container)).toHaveLength(0);
    });

    it("awaiting — the countdown, the hold-until time and one «Оплатити»", async () => {
      // 22 min 59 s left reads «23 хв» (rounded up).
      const expires = new Date(Date.now() + 23 * 60_000 - 1_000).toISOString();
      const { container } = await renderDetail({
        status: "PENDING",
        paymentStatus: "PENDING",
        paymentMethod: "ONLINE",
        reservationExpiresAt: expires,
        total: "3200.00",
      });
      expect(panel()).toHaveAttribute("data-tone", "warning");
      expect(panel()).toHaveTextContent(dict.orderHistory.awaitingPayment(23));
      expect(panel()).toHaveTextContent(pay.awaitingBody(formatTime(expires)));
      const buttons = primaries(container);
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toHaveTextContent(/^Оплатити 3\s200\s₴$/);
    });

    it("confirming — this browser just paid: spinner copy, no button", async () => {
      sessionStorage.setItem(
        "checkout:payment-attempt:order-1",
        JSON.stringify({ paymentId: "p-1", startedAt: Date.now() }),
      );
      const { container } = await renderDetail({
        status: "PENDING",
        paymentStatus: "PENDING",
        paymentMethod: "ONLINE",
        reservationExpiresAt: new Date(Date.now() + 600_000).toISOString(),
      });
      expect(panel()).toHaveTextContent(pay.pendingTitle);
      expect(panel()).toHaveTextContent(pay.pendingNote);
      expect(primaries(container)).toHaveLength(0);
    });

    it("stale — the callback never came: an OUTLINE retry", async () => {
      sessionStorage.setItem(
        "checkout:payment-attempt:order-1",
        JSON.stringify({ paymentId: "p-1", startedAt: Date.now() - 300_000 }),
      );
      const { container } = await renderDetail({
        status: "PENDING",
        paymentStatus: "PENDING",
        paymentMethod: "ONLINE",
      });
      expect(
        await within(
          await screen.findByTestId("order-payment-panel"),
        ).findByText(pay.slowTitle),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: pay.retry })).toHaveAttribute(
        "data-variant",
        "outline",
      );
      expect(primaries(container)).toHaveLength(0);
    });

    it("failed — destructive tint and one primary retry", async () => {
      const { container } = await renderDetail({
        status: "PENDING",
        paymentStatus: "FAILED",
        paymentMethod: "ONLINE",
      });
      expect(panel()).toHaveAttribute("data-tone", "negative");
      expect(panel()).toHaveTextContent(pay.failedTitle);
      const buttons = primaries(container);
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toHaveTextContent(pay.retry);
    });

    it("done — a delivered order whose payment failed: no retry", async () => {
      const { container } = await renderDetail({
        status: "DELIVERED",
        paymentStatus: "FAILED",
        paymentMethod: "ONLINE",
      });
      expect(panel()).toHaveTextContent(pay.orderClosedTitle);
      expect(primaries(container)).toHaveLength(0);
    });

    it("cash on delivery — no panel at all", async () => {
      const { container } = await renderDetail({
        status: "PENDING",
        paymentStatus: "PENDING",
        paymentMethod: "ON_DELIVERY",
      });
      expect(panel()).toBeNull();
      expect(primaries(container)).toHaveLength(0);
    });
  });

  it("never reports a purchase — that event is the confirmation page's", async () => {
    const track = jest.fn();
    window.umami = { track };
    await renderDetail({
      status: "SHIPPED",
      paymentStatus: "PAID",
      paymentMethod: "ONLINE",
    });
    await screen.findByText(pay.paidTitle);
    expect(track).not.toHaveBeenCalledWith("purchase", expect.anything());
    delete window.umami;
  });

  describe("summary", () => {
    it("shows «Послуги» only when the order bought services", async () => {
      await renderDetail({ addonsTotal: "0.00" });
      expect(totals().queryByText(dict.order.addons)).toBeNull();
    });

    it("adds «Послуги», the coded discount in the sale colour and a priced delivery", async () => {
      await renderDetail({
        subtotal: "3295.00",
        addonsTotal: "150.00",
        discount: "330.00",
        discountCode: "WELCOME10",
        shippingCost: "85.00",
        total: "3200.00",
      });
      const rows = totals();
      expect(rows.getByText(dict.order.addons)).toBeInTheDocument();
      const discount = rows.getByText(/^–330\s₴$/);
      expect(discount).toHaveClass("text-sale");
      expect(
        rows.getByText(dict.order.discountWithCode("WELCOME10")),
      ).toBeInTheDocument();
      expect(rows.getByText(/^85\s₴$/)).toBeInTheDocument();
      expect(rows.getByText(/^3\s200\s₴$/)).toBeInTheDocument();
    });

    it("reads a free pickup as «Безкоштовно»", async () => {
      await renderDetail({ deliveryMethod: "PICKUP", shippingCost: "0.00" });
      expect(totals().getByText(dict.order.shippingFree)).toBeInTheDocument();
    });

    // TASK-647: a legacy Nova Poshta order booked at 0 was never priced (the
    // estimate failed, or it was taken by phone) — the API's own rule.
    it("never reads a Nova Poshta order at 0 as «Безкоштовно»", async () => {
      await renderDetail({
        deliveryMethod: "NOVA_POSHTA",
        shippingCost: "0.00",
      });
      expect(
        totals().getByText(dict.order.shippingPending),
      ).toBeInTheDocument();
      expect(totals().queryByText(dict.order.shippingFree)).toBeNull();
      expect(
        totals().getByText(dict.order.deliveryBlock.totalWithoutShipping),
      ).toBeInTheDocument();
    });

    it.each([
      ["ONLINE", dict.checkout.payment.onlineTitle],
      ["ON_DELIVERY", dict.checkout.payment.onDeliveryTitle],
    ] as const)("names the %s payment method", async (method, label) => {
      await renderDetail({ paymentMethod: method, status: "SHIPPED" });
      expect(
        totals().getByText(dict.order.paymentMethodLabel),
      ).toBeInTheDocument();
      expect(totals().getByText(label)).toBeInTheDocument();
    });
  });

  describe("delivery", () => {
    it("shows the ТТН with copy and track once the parcel is handed over", async () => {
      await renderDetail({
        status: "SHIPPED",
        trackingNumber: "20450123456789",
      });
      const block = within(screen.getByTestId("order-detail-delivery"));
      expect(block.getByText("20450123456789")).toBeInTheDocument();
      expect(
        block.getByRole("link", { name: dict.order.tracking.trackAria }),
      ).toBeInTheDocument();
      expect(block.queryByText(d.trackingNone)).toBeNull();
    });

    it("says «Ще не передано перевізнику» without one", async () => {
      await renderDetail({ trackingNumber: null });
      expect(
        within(screen.getByTestId("order-detail-delivery")).getByText(
          d.trackingNone,
        ),
      ).toBeInTheDocument();
    });

    it("lists method, recipient, city and branch from the snapshot", async () => {
      await renderDetail();
      const block = within(screen.getByTestId("order-detail-delivery"));
      expect(
        block.getByText(d.deliveryMethods.NOVA_POSHTA),
      ).toBeInTheDocument();
      expect(block.getByText("Олег Коваль")).toBeInTheDocument();
      expect(block.getByText("+380 50 123 4567")).toBeInTheDocument();
      expect(block.getByText("Київ")).toBeInTheDocument();
      expect(block.getByText("Відділення №1")).toBeInTheDocument();
    });

    // TASK-647: the same facts the confirmation page shows.
    it("shows the pickup point with its hours, phone and map link", async () => {
      await renderDetail({
        deliveryMethod: "PICKUP",
        shippingAddress: {
          firstName: "Олег",
          lastName: "Коваль",
          phone: "+380501234567",
          city: "Київ",
          address1: "вул. Хрещатик, 22",
          pickupPointName: "Магазин на Хрещатику",
          pickupPointAddress: "вул. Хрещатик, 22",
          pickupPointHours: "Пн–Сб 10:00–20:00",
          pickupPointPhone: "+380441234567",
          pickupPointMapUrl: "https://maps.app.goo.gl/abc",
        },
      });
      const block = within(screen.getByTestId("order-detail-delivery"));
      expect(
        block.getByText("Магазин на Хрещатику, вул. Хрещатик, 22"),
      ).toBeInTheDocument();
      expect(
        block.getByText("Пн–Сб 10:00–20:00 · +380441234567"),
      ).toBeInTheDocument();
      expect(
        block.getByRole("link", {
          name: new RegExp(dict.order.deliveryBlock.mapLink),
        }),
      ).toHaveAttribute("href", "https://maps.app.goo.gl/abc");
      // No carrier, no waybill row.
      expect(block.queryByText(d.trackingNone)).toBeNull();
    });

    it("tells an unpriced «інша доставка» that an operator will quote it", async () => {
      await renderDetail({
        deliveryMethod: "OTHER",
        shippingCost: "0.00",
        shippingAddress: {
          firstName: "Олег",
          lastName: "Коваль",
          city: "Ужгород",
          address1: "Укрпошта, індекс 88000",
          shippingCostPending: true,
        },
      });
      const block = within(screen.getByTestId("order-detail-delivery"));
      expect(block.getByText("Укрпошта, індекс 88000")).toBeInTheDocument();
      expect(
        block.getByText(dict.order.deliveryBlock.otherNote),
      ).toBeInTheDocument();
    });

    it("shows the customer's notes in their own card", async () => {
      await renderDetail({ notes: "Зателефонуйте перед відправкою." });
      expect(screen.getByTestId("order-detail-notes")).toHaveTextContent(
        "Зателефонуйте перед відправкою.",
      );
    });
  });

  describe("actions", () => {
    it("offers cancel on a PENDING order", async () => {
      await renderDetail({ status: "PENDING" });
      expect(
        screen.getByRole("button", { name: dict.cancelOrder.trigger }),
      ).toBeInTheDocument();
    });

    it("offers a return on a DELIVERED order only", async () => {
      await renderDetail({ status: "DELIVERED" });
      expect(
        screen.getByRole("button", {
          name: dict.returnRequest.triggerAria("#ORDER-1"),
        }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: dict.cancelOrder.trigger }),
      ).toBeNull();
    });
  });

  it("not found — the card with one way back to the list", async () => {
    server.use(
      http.get("*/api/orders/:id", () =>
        HttpResponse.json({ message: "Not found" }, { status: 404 }),
      ),
    );
    const { container } = renderWithProviders(
      <OrderDetailView orderId="nope" />,
      authed,
    );

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("heading", { level: 1 })).toHaveTextContent(
      dict.order.notFoundHeading,
    );
    expect(alert).toHaveTextContent(dict.order.notFoundBody);
    expect(
      within(alert).getByRole("link", { name: d.backToList }),
    ).toHaveAttribute("href", "/account/orders");
    expect(primaries(container)).toHaveLength(1);
  });

  it("load error — says so and retries the request", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/orders/:id", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ message: "boom" }, { status: 500 })
          : HttpResponse.json(makeOrder({ status: "SHIPPED" }));
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<OrderDetailView orderId="order-1" />, authed);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(dict.order.loadErrorBody);
    await user.click(
      within(alert).getByRole("button", { name: dict.common.tryAgain }),
    );

    expect(
      await screen.findByRole("list", { name: d.stepsAria }),
    ).toBeInTheDocument();
  });

  it("shows the skeleton while the order loads", () => {
    serve();
    renderWithProviders(<OrderDetailView orderId="order-1" />, authed);
    expect(screen.getByTestId("order-detail-skeleton")).toBeInTheDocument();
    // The way back is a real link even before the order lands (the mockup
    // keeps it outside the skeleton).
    expect(
      screen.getByRole("link", { name: dict.account.dashboard.nav.orders }),
    ).toHaveAttribute("href", "/account/orders");
  });
});
