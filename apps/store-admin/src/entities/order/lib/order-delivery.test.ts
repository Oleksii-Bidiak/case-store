import {
  deliveryMethodLabel,
  deliverySnapshot,
  isShippingCostPending,
  orderDeliveryMethod,
} from "./order-delivery";

describe("order-delivery (TASK-648)", () => {
  it("reads the order's method, then the snapshot's, then Nova Poshta", () => {
    expect(
      orderDeliveryMethod({ deliveryMethod: "PICKUP", shippingAddress: null }),
    ).toBe("PICKUP");
    expect(
      orderDeliveryMethod({
        deliveryMethod: undefined as never,
        shippingAddress: {
          firstName: "",
          lastName: "",
          address1: "",
          city: "",
          deliveryMethod: "COURIER",
        },
      }),
    ).toBe("COURIER");
    expect(
      orderDeliveryMethod({
        deliveryMethod: undefined as never,
        shippingAddress: null,
      }),
    ).toBe("NOVA_POSHTA");
  });

  it("names the method with the admin apostrophe", () => {
    expect(deliveryMethodLabel("COURIER")).toBe("Курʼєр");
    expect(deliveryMethodLabel("OTHER")).toBe("Інша доставка");
    expect(deliveryMethodLabel("UNKNOWN")).toBe("UNKNOWN");
  });

  it("treats OTHER — or the snapshot's flag — as a cost still to be quoted", () => {
    expect(
      isShippingCostPending({ deliveryMethod: "OTHER", shippingAddress: null }),
    ).toBe(true);
    expect(
      isShippingCostPending({
        deliveryMethod: "NOVA_POSHTA",
        shippingAddress: {
          firstName: "",
          lastName: "",
          address1: "",
          city: "",
          shippingCostPending: true,
        },
      }),
    ).toBe(true);
    expect(
      isShippingCostPending({
        deliveryMethod: "COURIER",
        shippingAddress: null,
      }),
    ).toBe(false);
  });

  it("trims the snapshot and leaves blanks out", () => {
    expect(
      deliverySnapshot({
        firstName: " Olena ",
        lastName: "",
        address1: "вул. 1",
        city: "Київ",
        pickupPointName: null,
      }),
    ).toMatchObject({
      firstName: "Olena",
      lastName: undefined,
      address1: "вул. 1",
      pickupPointName: undefined,
    });
    expect(deliverySnapshot(null).city).toBeUndefined();
  });
});
