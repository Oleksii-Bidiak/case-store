import {
  coercePaymentMethod,
  parseConfiguredMethods,
  paymentMethodTitle,
  requiresPaymentHandoff,
  resolvePaymentMethods,
  toOrderPaymentMethod,
  type PaymentMethodOption,
} from "./payment-methods";
import { dict } from "@/shared/config";

/**
 * TASK-330-B. The rules that decide what the payment section is allowed to
 * offer. The failure this guards against is specific and has happened before:
 * an option rendered on the page that nothing downstream could honour.
 */
describe("parseConfiguredMethods", () => {
  it("offers only cash on delivery when nothing is configured", () => {
    expect(parseConfiguredMethods(undefined)).toEqual(["ON_DELIVERY"]);
    expect(parseConfiguredMethods("")).toEqual(["ON_DELIVERY"]);
  });

  it("adds the online methods the deployment switched on", () => {
    expect(parseConfiguredMethods("ONLINE")).toEqual(["ON_DELIVERY", "ONLINE"]);
    expect(parseConfiguredMethods("ONLINE,INSTALLMENTS")).toEqual([
      "ON_DELIVERY",
      "ONLINE",
      "INSTALLMENTS",
    ]);
  });

  it("tolerates whitespace and casing in the environment value", () => {
    expect(parseConfiguredMethods(" online , Installments ")).toEqual([
      "ON_DELIVERY",
      "ONLINE",
      "INSTALLMENTS",
    ]);
  });

  it("drops unknown values rather than trusting them", () => {
    // A typo in a deployment variable must not put an unhonourable option on the
    // page — it degrades to the safe default instead.
    expect(parseConfiguredMethods("ONLIEN,BITCOIN")).toEqual(["ON_DELIVERY"]);
  });

  it("keeps cash on delivery even if the deployment omits it", () => {
    // It needs no provider, no keys and no account, so it can never be absent.
    expect(parseConfiguredMethods("ONLINE")).toContain("ON_DELIVERY");
  });

  it("returns methods in a stable display order regardless of input order", () => {
    expect(parseConfiguredMethods("INSTALLMENTS,ONLINE")).toEqual([
      "ON_DELIVERY",
      "ONLINE",
      "INSTALLMENTS",
    ]);
  });
});

describe("requiresPaymentHandoff", () => {
  it("is true exactly for the methods that leave for the provider", () => {
    expect(requiresPaymentHandoff("ONLINE")).toBe(true);
    expect(requiresPaymentHandoff("INSTALLMENTS")).toBe(true);
    expect(requiresPaymentHandoff("ON_DELIVERY")).toBe(false);
  });
});

describe("resolvePaymentMethods", () => {
  it("enables every configured method for a signed-in shopper", () => {
    const options = resolvePaymentMethods({
      configured: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
      isAuthenticated: true,
    });

    expect(options.map((o) => o.method)).toEqual([
      "ON_DELIVERY",
      "ONLINE",
      "INSTALLMENTS",
    ]);
    expect(options.every((o) => o.enabled)).toBe(true);
  });

  it("blocks the online methods for a guest, with the reason attached", () => {
    // Not a product preference: POST /api/payments/orders/:id/checkout is behind
    // JwtAuthGuard, so a guest choosing card would dead-end on a 401.
    const options = resolvePaymentMethods({
      configured: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
      isAuthenticated: false,
    });

    const byMethod = Object.fromEntries(options.map((o) => [o.method, o]));
    expect(byMethod.ON_DELIVERY.enabled).toBe(true);
    expect(byMethod.ONLINE.enabled).toBe(false);
    expect(byMethod.ONLINE.blockedBy).toBe("account-required");
    expect(byMethod.INSTALLMENTS.blockedBy).toBe("account-required");
  });

  it("leaves cash on delivery usable for a guest — checkout is not gated", () => {
    const options = resolvePaymentMethods({
      configured: ["ON_DELIVERY"],
      isAuthenticated: false,
    });

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ method: "ON_DELIVERY", enabled: true });
  });
});

describe("coercePaymentMethod", () => {
  const options: PaymentMethodOption[] = [
    { method: "ON_DELIVERY", title: "a", note: "b", enabled: true },
    {
      method: "ONLINE",
      title: "c",
      note: "d",
      enabled: false,
      blockedBy: "account-required",
    },
  ];

  it("keeps a selection that is genuinely available", () => {
    expect(coercePaymentMethod("ON_DELIVERY", options)).toBe("ON_DELIVERY");
  });

  it("falls back when the selection is present but not usable", () => {
    // e.g. a session expired between picking card and submitting.
    expect(coercePaymentMethod("ONLINE", options)).toBe("ON_DELIVERY");
  });

  it("falls back when nothing was selected at all", () => {
    expect(coercePaymentMethod(undefined, options)).toBe("ON_DELIVERY");
  });
});

// TASK-646: the delivery narrows the payment list through the server's matrix.
describe("resolvePaymentMethods — delivery × payment matrix (TASK-646)", () => {
  const matrix = {
    NOVA_POSHTA: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
    PICKUP: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
    COURIER: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
    OTHER: ["ON_DELIVERY"],
  } as const satisfies Record<string, readonly string[]>;
  const all = ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"] as const;

  const resolve = (
    method: "NOVA_POSHTA" | "PICKUP" | "COURIER" | "OTHER",
    {
      npManual = false,
      isAuthenticated = true,
    }: { npManual?: boolean; isAuthenticated?: boolean } = {},
  ) =>
    Object.fromEntries(
      resolvePaymentMethods({
        configured: [...all],
        isAuthenticated,
        delivery: {
          method,
          npManual,
          matrix: {
            NOVA_POSHTA: [...matrix.NOVA_POSHTA],
            PICKUP: [...matrix.PICKUP],
            COURIER: [...matrix.COURIER],
            OTHER: [...matrix.OTHER],
          },
        },
      }).map((o) => [o.method, o]),
    );

  it.each(["NOVA_POSHTA", "PICKUP", "COURIER"] as const)(
    "leaves every method usable for %s",
    (method) => {
      const byMethod = resolve(method);
      expect(all.every((m) => byMethod[m].enabled)).toBe(true);
    },
  );

  it("rules the online methods out for «інша доставка», saying why", () => {
    const byMethod = resolve("OTHER");
    expect(byMethod.ON_DELIVERY.enabled).toBe(true);
    for (const method of ["ONLINE", "INSTALLMENTS"] as const) {
      expect(byMethod[method]).toMatchObject({
        enabled: false,
        blockedBy: "delivery-matrix",
        blockedReason: dict.checkout.delivery.paymentBlockedOther,
      });
    }
  });

  it("treats the Nova Poshta manual path as OTHER, with its own reason (TASK-1097)", () => {
    const byMethod = resolve("NOVA_POSHTA", { npManual: true });
    expect(byMethod.ONLINE).toMatchObject({
      enabled: false,
      blockedBy: "delivery-matrix",
      blockedReason: dict.checkout.delivery.paymentBlockedNpDown,
    });
    expect(byMethod.ON_DELIVERY.note).toBe(
      dict.checkout.delivery.onDeliveryNote.OTHER,
    );
  });

  it("puts the delivery reason before the sign-in one — signing in would not help", () => {
    const byMethod = resolve("OTHER", { isAuthenticated: false });
    expect(byMethod.ONLINE.blockedBy).toBe("delivery-matrix");
    expect(byMethod.ONLINE.blockedReason).toBe(
      dict.checkout.delivery.paymentBlockedOther,
    );
    // Where the delivery allows it, a guest still meets the account reason.
    expect(resolve("PICKUP", { isAuthenticated: false }).ONLINE).toMatchObject({
      blockedBy: "account-required",
      blockedReason: dict.checkout.payment.accountRequired,
    });
  });

  it.each([
    ["NOVA_POSHTA", dict.checkout.delivery.onDeliveryNote.NOVA_POSHTA],
    ["PICKUP", dict.checkout.delivery.onDeliveryNote.PICKUP],
    ["COURIER", dict.checkout.delivery.onDeliveryNote.COURIER],
    ["OTHER", dict.checkout.delivery.onDeliveryNote.OTHER],
  ] as const)("names where the cash changes hands for %s", (method, note) => {
    expect(resolve(method).ON_DELIVERY.note).toBe(note);
  });

  it("coerces a card choice back to cash when the delivery rules it out", () => {
    const options = Object.values(resolve("OTHER"));
    expect(coercePaymentMethod("ONLINE", options)).toBe("ON_DELIVERY");
  });
});

// TASK-650: every UI method maps onto a value `CreateOrderDto` accepts.
describe("toOrderPaymentMethod", () => {
  it.each([
    ["ON_DELIVERY", "ON_DELIVERY"],
    ["ONLINE", "ONLINE"],
    ["INSTALLMENTS", "INSTALLMENTS"],
  ] as const)("maps %s to the API's %s", (method, expected) => {
    expect(toOrderPaymentMethod(method)).toBe(expected);
  });
});

// TASK-882: the review step names the method exactly as the radio did.
describe("paymentMethodTitle", () => {
  it("reads back the same title the option is offered under", () => {
    const offered = resolvePaymentMethods({
      configured: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
      isAuthenticated: true,
    });
    for (const option of offered) {
      expect(paymentMethodTitle(option.method)).toBe(option.title);
    }
  });
});
