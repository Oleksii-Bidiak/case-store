import { renderWithProviders, screen, within } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { OrderDeliveryBlock } from "./order-delivery-block";

const t = dict.order.deliveryBlock;

const buyer = {
  firstName: "Олег",
  lastName: "Коваль",
  phone: "+380501234567",
  city: "Київ",
};

function block() {
  return within(screen.getByTestId("order-delivery"));
}

/**
 * TASK-647 (OrderConfirmation.dc.html): one «Доставка» block for the four
 * methods — the bold method line, then the lines that matter for THAT method.
 */
describe("OrderDeliveryBlock (TASK-647)", () => {
  it("Nova Poshta — recipient, branch, city and phone", () => {
    renderWithProviders(
      <OrderDeliveryBlock
        order={{
          deliveryMethod: "NOVA_POSHTA",
          shippingCost: "70.00",
          shippingAddress: {
            ...buyer,
            address1: "typed",
            npWarehouseName: "Відділення №1: вул. Пилипа Орлика, 1",
          },
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: t.heading }),
    ).toBeInTheDocument();
    expect(block().getByText(t.methods.NOVA_POSHTA)).toHaveClass(
      "font-semibold",
    );
    expect(block().getByText("Олег Коваль")).toBeInTheDocument();
    expect(
      block().getByText("Відділення №1: вул. Пилипа Орлика, 1"),
    ).toBeInTheDocument();
    expect(block().getByText("Київ")).toBeInTheDocument();
    expect(block().getByText("+380501234567")).toBeInTheDocument();
    expect(block().queryByText(t.otherNote)).toBeNull();
    expect(block().queryByRole("link")).toBeNull();
  });

  it("pickup — the point as it was at checkout, the map link and the call note", () => {
    renderWithProviders(
      <OrderDeliveryBlock
        order={{
          deliveryMethod: "PICKUP",
          shippingCost: "0.00",
          shippingAddress: {
            ...buyer,
            address1: "вул. Хрещатик, 22",
            pickupPointName: "Магазин на Хрещатику",
            pickupPointAddress: "вул. Хрещатик, 22",
            pickupPointHours: "Пн–Сб 10:00–20:00",
            pickupPointPhone: "+380441234567",
            pickupPointMapUrl: "https://maps.app.goo.gl/abc",
          },
        }}
      />,
    );

    expect(
      block().getByText(t.pickupTitle("Магазин на Хрещатику")),
    ).toBeInTheDocument();
    expect(block().getByText("Київ, вул. Хрещатик, 22")).toBeInTheDocument();
    expect(
      block().getByText("Пн–Сб 10:00–20:00 · +380441234567"),
    ).toBeInTheDocument();
    const link = block().getByRole("link", { name: new RegExp(t.mapLink) });
    expect(link).toHaveAttribute("href", "https://maps.app.goo.gl/abc");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(link).toHaveTextContent(t.newTab);
    expect(block().getByText(t.pickupNote)).toBeInTheDocument();
    // The point is the shop's, not the buyer's home: no recipient line.
    expect(block().queryByText("Олег Коваль")).toBeNull();
  });

  it("pickup without a map link — no dead link", () => {
    renderWithProviders(
      <OrderDeliveryBlock
        order={{
          deliveryMethod: "PICKUP",
          shippingAddress: {
            pickupPointName: "Магазин",
            pickupPointMapUrl: "javascript:alert(1)",
          },
        }}
      />,
    );
    expect(block().queryByRole("link")).toBeNull();
  });

  it("courier — recipient, street, city and phone", () => {
    renderWithProviders(
      <OrderDeliveryBlock
        order={{
          deliveryMethod: "COURIER",
          shippingCost: "150.00",
          shippingAddress: {
            ...buyer,
            address1: "вул. Хрещатик, 1, кв. 5",
          },
        }}
      />,
    );

    expect(block().getByText(t.methods.COURIER)).toBeInTheDocument();
    expect(block().getByText("Олег Коваль")).toBeInTheDocument();
    expect(block().getByText("вул. Хрещатик, 1, кв. 5")).toBeInTheDocument();
    expect(block().getByText("Київ")).toBeInTheDocument();
    expect(block().queryByText(t.pickupNote)).toBeNull();
  });

  it("other — what the buyer typed and the operator note while unpriced", () => {
    renderWithProviders(
      <OrderDeliveryBlock
        order={{
          deliveryMethod: "OTHER",
          shippingCost: "0.00",
          shippingAddress: {
            ...buyer,
            city: "Ужгород",
            address1: "Укрпошта, індекс 88000",
            shippingCostPending: true,
          },
        }}
      />,
    );

    expect(block().getByText(t.methods.OTHER)).toBeInTheDocument();
    expect(block().getByText("Укрпошта, індекс 88000")).toBeInTheDocument();
    expect(block().getByText("Ужгород")).toBeInTheDocument();
    expect(block().getByText(t.otherNote)).toBeInTheDocument();
  });

  it("other — no «will call» note once the operator has quoted it", () => {
    renderWithProviders(
      <OrderDeliveryBlock
        order={{
          deliveryMethod: "OTHER",
          shippingCost: "95.00",
          shippingAddress: { ...buyer, shippingCostPending: true },
        }}
      />,
    );
    expect(block().queryByText(t.otherNote)).toBeNull();
  });
});
