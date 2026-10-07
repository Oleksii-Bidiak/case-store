import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, within } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { formatCurrency, formatUAPhone } from "@/shared/lib";
import type { OrderEntity } from "@/entities/order";
import { OrderDeliverySection } from "./order-delivery-section";
import { OrderDetailView } from "./order-detail-view";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

const d = dict.orders;

/** testing-library normalises the DOM's whitespace, not a string matcher's. */
const plain = (text: string) => text.replace(/\s/g, " ");

const RECIPIENT = {
  firstName: "Olena",
  lastName: "Shevchenko",
  phone: "+380501234567",
};

function makeOrder(overrides: Partial<OrderEntity>): OrderEntity {
  return {
    id: "order-uuid-12345678",
    userId: "user-uuid-87654321",
    status: "PENDING",
    paymentStatus: "PENDING",
    paymentMethod: "ON_DELIVERY",
    deliveryMethod: "NOVA_POSHTA",
    paidAt: null,
    reservationExpiresAt: null,
    subtotal: "1299",
    discount: "0",
    discountCode: null,
    shippingCost: "70",
    tax: "0",
    addonsTotal: "0",
    total: "1369",
    pickupPointId: null,
    shippingAddress: {
      ...RECIPIENT,
      city: "Київ",
      address1: "Відділення №1",
      npWarehouseName: "Відділення №1",
    },
    billingAddress: null,
    notes: null,
    items: [],
    customer: null,
    restockedAt: null,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
    trackingNumber: null,
    ...overrides,
  } as OrderEntity;
}

/** The `dl` row `label` → its value. */
function row(label: string): HTMLElement {
  const term = screen.getByText(label, { selector: "dt" });
  return term.nextElementSibling as HTMLElement;
}

function section(): HTMLElement {
  return screen.getByRole("region", { name: d.deliveryHeading });
}

describe("OrderDeliverySection — one block for four methods (TASK-648, ДН-1.13)", () => {
  it("Нова Пошта: recipient, where, the NP tariff, and the waybill", () => {
    renderWithProviders(<OrderDeliverySection order={makeOrder({})} />);

    expect(within(section()).getByText("Нова Пошта")).toBeInTheDocument();
    expect(row(d.deliveryRecipient)).toHaveTextContent(
      plain(`Olena Shevchenko, ${formatUAPhone("+380501234567")}`),
    );
    expect(row(d.deliveryWhere)).toHaveTextContent("Київ, Відділення №1");
    expect(row(d.deliveryCost)).toHaveTextContent(
      plain(d.deliveryCostNp(formatCurrency("70"))),
    );
    // The waybill stays in this block (read-only for a session without
    // `orders:write`).
    expect(screen.getByText(d.trackingNumber)).toBeInTheDocument();
  });

  it("Нова Пошта with no booked cost: the carrier's tariff, never «0 ₴»", () => {
    renderWithProviders(
      <OrderDeliverySection order={makeOrder({ shippingCost: "0" })} />,
    );

    expect(row(d.deliveryCost)).toHaveTextContent(d.deliveryCostNpTariff);
  });

  it("Самовивіз: the point as the buyer saw it, free, and no waybill", () => {
    renderWithProviders(
      <OrderDeliverySection
        order={makeOrder({
          deliveryMethod: "PICKUP",
          shippingCost: "0",
          pickupPointId: "point-1",
          shippingAddress: {
            ...RECIPIENT,
            city: "Київ",
            address1: "вул. Хрещатик, 1",
            deliveryMethod: "PICKUP",
            pickupPointName: "Магазин на Хрещатику",
            pickupPointAddress: "вул. Хрещатик, 1",
            pickupPointHours: "Пн–Сб 10:00–20:00",
            pickupPointPhone: "+380441234567",
          },
        })}
      />,
    );

    expect(within(section()).getByText("Самовивіз")).toBeInTheDocument();
    expect(row(d.deliveryPoint)).toHaveTextContent("Магазин на Хрещатику");
    expect(row(d.deliveryAddress)).toHaveTextContent("Київ, вул. Хрещатик, 1");
    expect(row(d.deliveryHours)).toHaveTextContent(
      plain(`Пн–Сб 10:00–20:00 · ${formatUAPhone("+380441234567")}`),
    );
    expect(row(d.deliveryCost)).toHaveTextContent(d.deliveryFree);
    expect(screen.getByText(d.deliveryPickupHint)).toBeInTheDocument();
    expect(screen.queryByText(d.trackingNumber)).not.toBeInTheDocument();
  });

  it("Курʼєр: the address and the price", () => {
    renderWithProviders(
      <OrderDeliverySection
        order={makeOrder({
          deliveryMethod: "COURIER",
          shippingCost: "150",
          shippingAddress: {
            ...RECIPIENT,
            city: "Київ",
            address1: "вул. Січових Стрільців, 5",
            address2: "кв. 12",
          },
        })}
      />,
    );

    expect(within(section()).getByText("Курʼєр")).toBeInTheDocument();
    expect(row(d.deliveryAddress)).toHaveTextContent(
      "Київ, вул. Січових Стрільців, 5, кв. 12",
    );
    expect(row(d.deliveryCost)).toHaveTextContent(plain(formatCurrency("150")));
    // The waybill is a Nova Poshta one — the shop's courier has none.
    expect(screen.queryByText(d.trackingNumber)).not.toBeInTheDocument();
  });

  it("Курʼєр free: names the threshold for a session with settings:delivery", async () => {
    server.use(
      http.get("*/api/admin/delivery-settings", () =>
        HttpResponse.json({ data: { courierFreeFrom: "2000" } }),
      ),
    );
    renderWithProviders(
      <OrderDeliverySection
        order={makeOrder({
          deliveryMethod: "COURIER",
          shippingCost: "0",
          shippingAddress: { ...RECIPIENT, city: "Київ", address1: "вул. 1" },
        })}
      />,
      { auth: { permissions: ["orders:read", "settings:delivery"] } },
    );

    expect(
      await screen.findByText(
        plain(d.deliveryFreeFrom(formatCurrency("2000"))),
      ),
    ).toBeInTheDocument();
  });

  it("Курʼєр free without settings:delivery: just «Безкоштовно»", () => {
    renderWithProviders(
      <OrderDeliverySection
        order={makeOrder({
          deliveryMethod: "COURIER",
          shippingCost: "0",
          shippingAddress: { ...RECIPIENT, city: "Київ", address1: "вул. 1" },
        })}
      />,
    );

    expect(row(d.deliveryCost)).toHaveTextContent(d.deliveryFree);
  });

  it("Інша доставка: warning tone, what the buyer wrote, cost not calculated", () => {
    renderWithProviders(
      <OrderDeliverySection
        order={makeOrder({
          deliveryMethod: "OTHER",
          shippingCost: "0",
          shippingAddress: {
            ...RECIPIENT,
            city: "Ужгород",
            address1: "Укрпошта, 88000, вул. Корзо, 5",
            deliveryMethod: "OTHER",
            shippingCostPending: true,
          },
        })}
      />,
    );

    const block = section();
    expect(block).toHaveClass("border-warning/50");
    expect(within(block).getByText("Інша доставка")).toHaveClass("bg-warning");
    expect(row(d.deliveryBuyerWrote)).toHaveTextContent(
      "Укрпошта, 88000, вул. Корзо, 5, Ужгород",
    );
    expect(row(d.deliveryCost)).toHaveTextContent(d.deliveryCostNotCalculated);
    expect(screen.getByText(d.deliveryOtherWarning)).toBeInTheDocument();
    // Never «0 ₴» for a cost nobody quoted.
    expect(within(block).queryByText(/0 ₴/)).not.toBeInTheDocument();
  });

  it("Інша доставка quoted (90 ₴ booked): the cost, plain tone, no warning", () => {
    renderWithProviders(
      <OrderDeliverySection
        order={makeOrder({
          deliveryMethod: "OTHER",
          shippingCost: "90",
          shippingAddress: {
            ...RECIPIENT,
            city: "Ужгород",
            address1: "Укрпошта, 88000, вул. Корзо, 5",
            deliveryMethod: "OTHER",
            // The checkout snapshot still says pending; the booked cost wins.
            shippingCostPending: true,
          },
        })}
      />,
    );

    const block = section();
    expect(block).not.toHaveClass("border-warning/50");
    expect(within(block).getByText("Інша доставка")).not.toHaveClass(
      "bg-warning",
    );
    expect(row(d.deliveryBuyerWrote)).toHaveTextContent(
      "Укрпошта, 88000, вул. Корзо, 5, Ужгород",
    );
    expect(row(d.deliveryCost)).toHaveTextContent(plain(formatCurrency("90")));
    expect(
      screen.queryByText(d.deliveryCostNotCalculated),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(d.deliveryOtherWarning)).not.toBeInTheDocument();
  });

  it("falls back to Нова Пошта for a payload with no method at all", () => {
    renderWithProviders(
      <OrderDeliverySection
        order={makeOrder({
          deliveryMethod: undefined as unknown as OrderEntity["deliveryMethod"],
        })}
      />,
    );

    expect(within(section()).getByText("Нова Пошта")).toBeInTheDocument();
  });
});

describe("OrderDetailView — the totals for an OTHER order (TASK-648)", () => {
  it("says «не розрахована» instead of «0 ₴» for the delivery", async () => {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({
          data: makeOrder({
            deliveryMethod: "OTHER",
            shippingCost: "0",
            shippingAddress: {
              ...RECIPIENT,
              city: "Ужгород",
              address1: "Укрпошта",
              shippingCostPending: true,
            },
          }),
        }),
      ),
    );
    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    const totals = await screen.findByRole("group", { name: d.summary });
    expect(
      within(totals).getByText(d.shipping).nextElementSibling,
    ).toHaveTextContent(d.deliveryCostNotCalculated);
  });

  it("shows the booked cost once quoted — the same 90 ₴ «Разом» includes", async () => {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({
          data: makeOrder({
            deliveryMethod: "OTHER",
            shippingCost: "90",
            total: "1389",
            shippingAddress: {
              ...RECIPIENT,
              city: "Ужгород",
              address1: "Укрпошта",
              shippingCostPending: true,
            },
          }),
        }),
      ),
    );
    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    const totals = await screen.findByRole("group", { name: d.summary });
    expect(
      within(totals).getByText(d.shipping).nextElementSibling,
    ).toHaveTextContent(plain(formatCurrency("90")));
  });
});
