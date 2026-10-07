import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { OrderDetailView } from "./order-detail-view";

// next/navigation is unavailable under jsdom — mock the router.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

/**
 * The shipping snapshot as the API writes it for a PICKUP order (TASK-643/647):
 * the buyer's name and phone, the pickup point's city and address, and the
 * delivery-only fields. Most admin tests use a bare four-field address. This one
 * carries everything the real column holds.
 */
const PICKUP_SNAPSHOT = {
  firstName: "Olena",
  lastName: "Shevchenko",
  phone: "+380501234567",
  city: "Київ",
  address1: "вул. Хрещатик, 1",
  country: "UA",
  deliveryMethod: "PICKUP",
  carrier: null,
  shippingCostPending: false,
  pickupPointName: "Магазин на Хрещатику",
  pickupPointAddress: "вул. Хрещатик, 1",
  pickupPointHours: "Пн–Пт 10–19",
  pickupPointPhone: "+380441234567",
  pickupPointMapUrl: "https://maps.example/x",
};

function makeOrder(billingAddress: unknown) {
  return {
    id: "order-uuid-12345678",
    userId: "user-uuid-87654321",
    status: "PENDING",
    paymentStatus: "PENDING",
    deliveryMethod: "PICKUP",
    subtotal: "29.99",
    discount: "0",
    shippingCost: "0",
    tax: "0",
    total: "29.99",
    shippingAddress: PICKUP_SNAPSHOT,
    billingAddress,
    notes: null,
    items: [
      {
        id: "item-1",
        productId: "prod-uuid-1",
        productName: "iPhone 15 Pro Case",
        price: "29.99",
        quantity: 1,
        lineTotal: "29.99",
      },
    ],
    customer: null,
    restockedAt: null,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
  };
}

function serve(billingAddress: unknown) {
  server.use(
    http.get("*/api/admin/orders/:orderId", () =>
      HttpResponse.json({ data: makeOrder(billingAddress) }),
    ),
  );
}

describe("OrderDetailView — billing address block (TASK-1022)", () => {
  // The API stores NULL when the buyer sent no billing address. Before the fix
  // it stored a copy of part of the snapshot. That copy never equalled the
  // snapshot, so every order showed «Платіжна адреса», and for PICKUP the block
  // showed the shop's own address.
  it("hides the billing block for a defaulted (null) billing address on a snapshot-shaped PICKUP order", async () => {
    serve(null);

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    expect(
      await screen.findByText(dict.orders.itemsHeading),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(dict.orders.billingAddress),
    ).not.toBeInTheDocument();
  });

  it("renders the billing block when the buyer sent a distinct billing address", async () => {
    serve({
      firstName: "Olena",
      lastName: "Shevchenko",
      city: "Львів",
      address1: "вул. Городоцька, 5",
    });

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    expect(
      await screen.findByText(dict.orders.billingAddress),
    ).toBeInTheDocument();
    expect(screen.getByText(/Городоцька/)).toBeInTheDocument();
  });
});
