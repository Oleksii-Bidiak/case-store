import {
  coercePaymentMethod,
  parseConfiguredMethods,
  requiresPaymentHandoff,
  resolvePaymentMethods,
  type PaymentMethodOption,
} from "./payment-methods";

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
