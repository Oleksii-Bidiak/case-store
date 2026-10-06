import { orderDeliveryDetails } from "./order-delivery";
import { orderUnitCount } from "./order-units";

describe("orderDeliveryDetails (TASK-217)", () => {
  it("reads the checkout shape: name, phone, city and the picked NP branch", () => {
    expect(
      orderDeliveryDetails({
        deliveryMethod: "NOVA_POSHTA",
        shippingAddress: {
          firstName: "Олексій",
          lastName: "Петренко",
          phone: "+380501234567",
          city: "Київ",
          address1: "typed text",
          npWarehouseName: "Відділення №1: вул. Пилипа Орлика, 1",
        },
      }),
    ).toEqual({
      recipient: "Олексій Петренко",
      phone: "+380501234567",
      city: "Київ",
      place: {
        kind: "warehouse",
        value: "Відділення №1: вул. Пилипа Орлика, 1",
      },
      shippingCostPending: false,
    });
  });

  it("reads the seeded shape: recipient and warehouse", () => {
    const details = orderDeliveryDetails({
      deliveryMethod: "NOVA_POSHTA",
      shippingAddress: {
        recipient: "John Doe",
        city: "Київ",
        warehouse: "Відділення №12",
      },
    });
    expect(details.recipient).toBe("John Doe");
    expect(details.place).toEqual({
      kind: "warehouse",
      value: "Відділення №12",
    });
  });

  it("names a pickup point, and a courier street address", () => {
    expect(
      orderDeliveryDetails({
        deliveryMethod: "PICKUP",
        shippingAddress: {
          pickupPointName: "Магазин на Подолі",
          pickupPointAddress: "вул. Сагайдачного, 1",
        },
      }).place,
    ).toEqual({
      kind: "pickup",
      value: "Магазин на Подолі, вул. Сагайдачного, 1",
    });
    expect(
      orderDeliveryDetails({
        deliveryMethod: "COURIER",
        shippingAddress: { address1: "вул. Хрещатик, 1", address2: "кв. 5" },
      }).place,
    ).toEqual({ kind: "address", value: "вул. Хрещатик, 1, кв. 5" });
  });

  it("flags a delivery the operator still has to price, and survives no address", () => {
    expect(
      orderDeliveryDetails({
        deliveryMethod: "OTHER",
        shippingAddress: { shippingCostPending: true },
      }).shippingCostPending,
    ).toBe(true);
    expect(
      orderDeliveryDetails({
        deliveryMethod: "NOVA_POSHTA",
        shippingAddress: null,
      }),
    ).toEqual({
      recipient: null,
      phone: null,
      city: null,
      place: null,
      shippingCostPending: false,
    });
  });
});

describe("orderUnitCount (TASK-217)", () => {
  it("counts units, not lines", () => {
    expect(
      orderUnitCount([{ quantity: 1 }, { quantity: 2 }, { quantity: 1 }]),
    ).toBe(4);
    expect(orderUnitCount([])).toBe(0);
  });
});
