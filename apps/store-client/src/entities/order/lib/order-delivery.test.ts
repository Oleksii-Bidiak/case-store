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
      method: "NOVA_POSHTA",
      recipient: "Олексій Петренко",
      phone: "+380501234567",
      city: "Київ",
      place: {
        kind: "warehouse",
        value: "Відділення №1: вул. Пилипа Орлика, 1",
      },
      street: "typed text",
      pickup: null,
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
      method: "NOVA_POSHTA",
      recipient: null,
      phone: null,
      city: null,
      place: null,
      street: null,
      pickup: null,
      shippingCostPending: false,
    });
  });
});

describe("orderDeliveryDetails — after checkout (TASK-647)", () => {
  it("reads the pickup point snapshot: name, address, hours, phone, map", () => {
    const details = orderDeliveryDetails({
      deliveryMethod: "PICKUP",
      shippingCost: "0.00",
      shippingAddress: {
        firstName: "Олег",
        lastName: "Коваль",
        city: "Київ",
        address1: "вул. Хрещатик, 22",
        pickupPointName: "Магазин на Хрещатику",
        pickupPointAddress: "вул. Хрещатик, 22",
        pickupPointHours: "Пн–Сб 10:00–20:00",
        pickupPointPhone: "+380441234567",
        pickupPointMapUrl: "https://maps.app.goo.gl/abc",
      },
    });
    expect(details.pickup).toEqual({
      name: "Магазин на Хрещатику",
      address: "вул. Хрещатик, 22",
      hours: "Пн–Сб 10:00–20:00",
      phone: "+380441234567",
      mapUrl: "https://maps.app.goo.gl/abc",
    });
    // A pickup at 0 is genuinely free.
    expect(details.shippingCostPending).toBe(false);
  });

  it("never turns a non-http map link into an href", () => {
    expect(
      orderDeliveryDetails({
        deliveryMethod: "PICKUP",
        shippingAddress: { pickupPointMapUrl: "javascript:alert(1)" },
      }).pickup?.mapUrl,
    ).toBeNull();
  });

  it.each([
    // [method, cost, snapshot flag, pending]
    ["NOVA_POSHTA", "0.00", false, true], // legacy: the estimate never came
    ["OTHER", "0.00", false, true], // backfilled free-text city
    ["OTHER", "0.00", true, true],
    ["PICKUP", "0.00", false, false],
    ["COURIER", "0.00", false, false], // over the free threshold
    ["NOVA_POSHTA", "70.00", false, false],
    ["OTHER", "120.00", true, false], // quoted later: a sum wins
  ] as const)(
    "applies the API's rule: %s at %s (flag %s) → pending %s",
    (deliveryMethod, shippingCost, flag, pending) => {
      expect(
        orderDeliveryDetails({
          deliveryMethod,
          shippingCost,
          shippingAddress: flag ? { shippingCostPending: true } : {},
        }).shippingCostPending,
      ).toBe(pending);
    },
  );
});

describe("orderUnitCount (TASK-217)", () => {
  it("counts units, not lines", () => {
    expect(
      orderUnitCount([{ quantity: 1 }, { quantity: 2 }, { quantity: 1 }]),
    ).toBe(4);
    expect(orderUnitCount([])).toBe(0);
  });
});
