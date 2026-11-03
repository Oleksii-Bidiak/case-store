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

  it("treats OTHER — or the snapshot's flag — at 0 as a cost still to be quoted", () => {
    expect(
      isShippingCostPending({
        deliveryMethod: "OTHER",
        shippingAddress: null,
        shippingCost: "0.00",
      }),
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
        shippingCost: "0",
      }),
    ).toBe(true);
    expect(
      isShippingCostPending({
        deliveryMethod: "COURIER",
        shippingAddress: null,
        shippingCost: "0.00",
      }),
    ).toBe(false);
    // NP at 0 without the flag is «За тарифом НП», not a quote to make.
    expect(
      isShippingCostPending({
        deliveryMethod: "NOVA_POSHTA",
        shippingAddress: null,
        shippingCost: "0.00",
      }),
    ).toBe(false);
  });

  it("is false once a cost is booked — the API's rule, flag or not", () => {
    expect(
      isShippingCostPending({
        deliveryMethod: "OTHER",
        shippingAddress: null,
        shippingCost: "90.00",
      }),
    ).toBe(false);
    expect(
      isShippingCostPending({
        deliveryMethod: "OTHER",
        shippingAddress: {
          firstName: "",
          lastName: "",
          address1: "",
          city: "",
          shippingCostPending: true,
        },
        shippingCost: "90.00",
      }),
    ).toBe(false);
  });

  // TASK-1019: the operator agreed free delivery — the snapshot the server
  // rebuilt says OTHER and carries no flag, so 0 is a quote, not a gap. A
  // pre-TASK-1973 phone order has no method in its snapshot and stays pending.
  it("reads an OTHER at 0 as agreed once the server's snapshot dropped the flag", () => {
    const address = { firstName: "", lastName: "", address1: "", city: "" };
    expect(
      isShippingCostPending({
        deliveryMethod: "OTHER",
        shippingAddress: { ...address, deliveryMethod: "OTHER" },
        shippingCost: "0.00",
      }),
    ).toBe(false);
    expect(
      isShippingCostPending({
        deliveryMethod: "OTHER",
        shippingAddress: address,
        shippingCost: "0.00",
      }),
    ).toBe(true);
  });

  it("keeps the pickup point's map link (TASK-1979)", () => {
    expect(
      deliverySnapshot({
        firstName: "",
        lastName: "",
        address1: "",
        city: "",
        pickupPointMapUrl: " https://maps.example.com/p/1 ",
      }).pickupPointMapUrl,
    ).toBe("https://maps.example.com/p/1");
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
