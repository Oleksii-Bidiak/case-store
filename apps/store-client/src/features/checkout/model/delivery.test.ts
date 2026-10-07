import { dict } from "@/shared/config";
import {
  FALLBACK_DELIVERY_OPTIONS,
  bookedDeliveryMethod,
  courierAddressLine,
  courierFreeProgress,
  deliveryMethodTitle,
  deliveryQuoteText,
  quoteDelivery,
  resolveDeliveryMethod,
  toDeliveryOptions,
  type QuoteDeliveryInput,
} from "./delivery";

/** TASK-646 — the pure delivery rules behind the checkout. */
describe("toDeliveryOptions", () => {
  it("keeps the server's list, courier, points and matrix", () => {
    const dto = {
      methods: ["PICKUP", "OTHER"] as ("PICKUP" | "OTHER")[],
      courier: { price: "150.00", freeFrom: null, cityName: "Київ" },
      pickupPoints: [],
      paymentMatrix: FALLBACK_DELIVERY_OPTIONS.paymentMatrix,
    };
    expect(toDeliveryOptions(dto)).toEqual(dto);
  });

  it("falls back to Nova Poshta when the request failed or the list is empty", () => {
    expect(toDeliveryOptions(undefined)).toBe(FALLBACK_DELIVERY_OPTIONS);
    expect(
      toDeliveryOptions({
        ...FALLBACK_DELIVERY_OPTIONS,
        methods: [],
      }).methods,
    ).toEqual(["NOVA_POSHTA"]);
  });
});

describe("resolveDeliveryMethod", () => {
  it("keeps a selection the shop still offers", () => {
    expect(resolveDeliveryMethod("COURIER", ["NOVA_POSHTA", "COURIER"])).toBe(
      "COURIER",
    );
  });

  it("falls back to the first offered method — the mockup's default", () => {
    expect(resolveDeliveryMethod("NOVA_POSHTA", ["PICKUP", "OTHER"])).toBe(
      "PICKUP",
    );
    expect(resolveDeliveryMethod(undefined, ["OTHER"])).toBe("OTHER");
  });
});

describe("bookedDeliveryMethod (TASK-1097)", () => {
  it("books the Nova Poshta manual path as OTHER and leaves the rest alone", () => {
    expect(bookedDeliveryMethod("NOVA_POSHTA", true)).toBe("OTHER");
    expect(bookedDeliveryMethod("NOVA_POSHTA", false)).toBe("NOVA_POSHTA");
    expect(bookedDeliveryMethod("COURIER", true)).toBe("COURIER");
  });
});

describe("deliveryMethodTitle", () => {
  it("names the courier's city without declining it", () => {
    expect(deliveryMethodTitle("COURIER", "Київ")).toBe("Кур'єр · Київ");
    expect(deliveryMethodTitle("COURIER", null)).toBe(
      dict.checkout.delivery.titles.COURIER,
    );
    expect(deliveryMethodTitle("PICKUP")).toBe("Самовивіз з магазину");
  });
});

describe("courierAddressLine", () => {
  it("joins street, house and flat; the flat only when given", () => {
    expect(
      courierAddressLine({
        courierStreet: " вул. Хрещатик ",
        courierHouse: "22",
        courierApartment: "5",
      }),
    ).toBe("вул. Хрещатик, 22, кв. 5");
    expect(
      courierAddressLine({
        courierStreet: "вул. Хрещатик",
        courierHouse: "22",
      }),
    ).toBe("вул. Хрещатик, 22");
  });
});

describe("courierFreeProgress", () => {
  it("counts what is left to the threshold", () => {
    expect(courierFreeProgress("1500.00", "2000.00")).toMatchObject({
      free: false,
      remainingCents: 50000,
      percent: 75,
    });
  });

  it("is free at the threshold itself — inclusive, like the server", () => {
    expect(courierFreeProgress("2000.00", "2000.00")).toMatchObject({
      free: true,
      remainingCents: 0,
      percent: 100,
    });
  });

  it("is absent when the shop set no threshold", () => {
    expect(courierFreeProgress("500.00", null)).toBeNull();
  });
});

describe("quoteDelivery", () => {
  const input: QuoteDeliveryInput = {
    method: "NOVA_POSHTA",
    npManual: false,
    courier: { price: "150.00", freeFrom: "2000.00", cityName: "Київ" },
    subtotal: "1000.00",
    isEstimating: false,
    isEstimateError: false,
  };

  it("asks for a city before Nova Poshta can price anything", () => {
    expect(quoteDelivery(input)).toEqual({ kind: "select-city" });
  });

  it("returns the Nova Poshta estimate with its ETA", () => {
    expect(
      quoteDelivery({
        ...input,
        npCityRef: "ref",
        estimate: { cost: "60.00", etaDays: 2 },
      }),
    ).toEqual({ kind: "amount", cents: 6000, etaDays: 2 });
  });

  it("says «уточнить оператор» for a failed or empty estimate — never 0 ₴", () => {
    expect(
      quoteDelivery({ ...input, npCityRef: "ref", isEstimateError: true }),
    ).toEqual({ kind: "pending" });
    expect(
      quoteDelivery({
        ...input,
        npCityRef: "ref",
        estimate: { cost: "0.00", etaDays: 2 },
      }),
    ).toEqual({ kind: "pending" });
  });

  it("prices the manual path and «інша доставка» as pending", () => {
    expect(quoteDelivery({ ...input, npManual: true })).toEqual({
      kind: "pending",
    });
    expect(quoteDelivery({ ...input, method: "OTHER" })).toEqual({
      kind: "pending",
    });
  });

  it("makes pickup free", () => {
    expect(quoteDelivery({ ...input, method: "PICKUP" })).toEqual({
      kind: "free",
    });
  });

  it("charges the courier's price below the threshold and nothing above it", () => {
    expect(quoteDelivery({ ...input, method: "COURIER" })).toEqual({
      kind: "amount",
      cents: 15000,
    });
    expect(
      quoteDelivery({ ...input, method: "COURIER", subtotal: "2500.00" }),
    ).toEqual({ kind: "free" });
  });

  it("reads each quote back as one short string", () => {
    expect(deliveryQuoteText({ kind: "free" })).toBe(
      dict.checkout.delivery.free,
    );
    expect(deliveryQuoteText({ kind: "pending" })).toBe(
      dict.checkout.shippingCostUnknown,
    );
    expect(deliveryQuoteText({ kind: "amount", cents: 15000 })).toMatch(/150/);
  });
});
