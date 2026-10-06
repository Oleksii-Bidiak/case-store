import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import type { PublicOrderEntity } from "@/entities/order";
import { OrderLookupResult } from "./order-lookup-result";

const d = dict.orderLookup;

const order: PublicOrderEntity = {
  number: "94F5F971",
  createdAt: "2026-09-10T09:00:00.000Z",
  status: "PROCESSING",
  paymentStatus: "PENDING",
  paymentMethod: "ON_DELIVERY",
  deliveryMethod: "NOVA_POSHTA",
  items: [
    {
      productName: "Чохол MagSafe",
      quantity: 1,
      price: "598.00",
      lineTotal: "598.00",
      addons: [],
    },
  ],
  subtotal: "598.00",
  discount: "0.00",
  shippingCost: "70.00",
  addonsTotal: "0.00",
  total: "668.00",
  delivery: {
    city: "Київ",
    warehouse: "Відділення №12",
    pickupPointName: null,
    pickupPointAddress: null,
    shippingCostPending: false,
  },
  trackingNumber: null,
};

function shippingCell() {
  return screen.getByText(d.shipping, { selector: "dt:not(.sr-only)" })
    .nextElementSibling as HTMLElement;
}

/**
 * TASK-1030: the public status page names the REAL delivery method. Before it,
 * any order without a branch read «Курʼєром за вказаною адресою» — a pickup
 * buyer was told a courier was on the way.
 */
describe("OrderLookupResult — delivery (TASK-1030)", () => {
  it("Nova Poshta — «Нова Пошта: <відділення>», city, ТТН, priced row", () => {
    renderWithProviders(<OrderLookupResult order={order} />);

    expect(
      screen.getByText(d.deliveryNovaPoshta("Відділення №12")),
    ).toBeInTheDocument();
    expect(screen.getByText("Київ")).toBeInTheDocument();
    expect(screen.getByText(d.trackingNone)).toBeInTheDocument();
    expect(shippingCell().textContent?.replace(/\s/g, "")).toBe("70₴");
  });

  it("pickup — the point's name and address, free, no carrier promise", () => {
    renderWithProviders(
      <OrderLookupResult
        order={{
          ...order,
          deliveryMethod: "PICKUP",
          shippingCost: "0.00",
          total: "598.00",
          delivery: {
            city: "Київ",
            warehouse: null,
            pickupPointName: "Магазин на Хрещатику",
            pickupPointAddress: "вул. Хрещатик, 22",
            shippingCostPending: false,
          },
        }}
      />,
    );

    expect(
      screen.getByText(
        d.deliveryPickup("Магазин на Хрещатику, вул. Хрещатик, 22"),
      ),
    ).toBeInTheDocument();
    expect(shippingCell()).toHaveTextContent(d.shippingFree);
    expect(screen.queryByText(d.trackingNone)).toBeNull();
  });

  it("courier — «Кур'єр» and the city, never a street", () => {
    renderWithProviders(
      <OrderLookupResult
        order={{
          ...order,
          deliveryMethod: "COURIER",
          shippingCost: "150.00",
          delivery: { ...order.delivery, warehouse: null },
        }}
      />,
    );

    expect(screen.getByText(d.deliveryCourierMethod)).toBeInTheDocument();
    expect(screen.getByText("Київ")).toBeInTheDocument();
    expect(screen.queryByText(/вул\./)).toBeNull();
    expect(shippingCell().textContent?.replace(/\s/g, "")).toBe("150₴");
  });

  it("other — the operator sentence and «Уточнить оператор», never «0 ₴»", () => {
    renderWithProviders(
      <OrderLookupResult
        order={{
          ...order,
          deliveryMethod: "OTHER",
          shippingCost: "0.00",
          total: "598.00",
          delivery: {
            ...order.delivery,
            city: "Ужгород",
            warehouse: null,
            shippingCostPending: true,
          },
        }}
      />,
    );

    expect(screen.getByText(d.deliveryOther)).toBeInTheDocument();
    expect(shippingCell()).toHaveTextContent(d.shippingPending);
    expect(shippingCell()).toHaveClass("italic");
    expect(screen.queryByText(d.shippingFree)).toBeNull();
  });

  it("other, once priced — a neutral line that does not contradict the amount", () => {
    renderWithProviders(
      <OrderLookupResult
        order={{
          ...order,
          deliveryMethod: "OTHER",
          shippingCost: "95.00",
          delivery: {
            ...order.delivery,
            city: "Ужгород",
            warehouse: null,
            shippingCostPending: false,
          },
        }}
      />,
    );

    expect(screen.getByText(d.deliveryOtherPriced)).toBeInTheDocument();
    expect(screen.queryByText(d.deliveryOther)).toBeNull();
    expect(shippingCell().textContent?.replace(/\s/g, "")).toBe("95₴");
  });

  it("legacy Nova Poshta at 0 — the server's pending flag wins over «free»", () => {
    renderWithProviders(
      <OrderLookupResult
        order={{
          ...order,
          shippingCost: "0.00",
          total: "598.00",
          delivery: { ...order.delivery, shippingCostPending: true },
        }}
      />,
    );

    expect(shippingCell()).toHaveTextContent(d.shippingPending);
    expect(screen.queryByText(d.shippingFree)).toBeNull();
  });
});
