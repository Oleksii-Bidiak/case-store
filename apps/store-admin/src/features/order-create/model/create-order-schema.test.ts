import { dict } from "@/shared/config";
import {
  CREATE_ORDER_DEFAULTS,
  CUSTOMER_MODE,
  INTERNAL_NOTES_MAX_LENGTH,
  NOTES_MAX_LENGTH,
  allowedPaymentMethods,
  createOrderSchema,
  createOrderValuesToDto,
  operatorShippingCost,
  type CreateOrderFormValues,
  type DraftLine,
} from "./create-order-schema";

function values(
  overrides: Partial<CreateOrderFormValues> = {},
): CreateOrderFormValues {
  return {
    ...CREATE_ORDER_DEFAULTS,
    contactName: "Олена Шевченко",
    contactEmail: "olena@example.com",
    contactPhone: "+380501234567",
    firstName: "Олена",
    lastName: "Шевченко",
    phone: "+380501234567",
    city: "Київ",
    address1: "Відділення №12",
    // TASK-1973: a hand-typed address is «Інша доставка» now, chosen
    // explicitly; the Nova Poshta cases below say NOVA_POSHTA themselves.
    deliveryMethod: "OTHER",
    ...overrides,
  };
}

const LINES: DraftLine[] = [
  {
    productId: "prod-1",
    productName: "iPhone 15 Case",
    price: "499.00",
    quantity: 2,
  },
];

const PICKED_USER_ID = "550e8400-e29b-41d4-a716-446655440001";

describe("createOrderValuesToDto — who the order belongs to (TASK-341)", () => {
  it("sends the contact block and NO userId for a walk-in", () => {
    const dto = createOrderValuesToDto(values(), LINES);

    expect(dto.contact).toEqual({
      name: "Олена Шевченко",
      email: "olena@example.com",
      phone: "+380501234567",
    });
    // The two are mutually exclusive server-side; sending a blank `userId`
    // alongside would be a rejection the operator did not cause.
    expect(dto).not.toHaveProperty("userId");
  });

  it("sends the userId and NO contact block for an account order", () => {
    const dto = createOrderValuesToDto(
      values({
        customerMode: CUSTOMER_MODE.ACCOUNT,
        userId: PICKED_USER_ID,
      }),
      LINES,
    );

    expect(dto.userId).toBe(PICKED_USER_ID);
    expect(dto).not.toHaveProperty("contact");
  });

  // TASK-426: `ManualOrderContactDto` makes email optional, because an operator
  // with the customer on the line frequently has no address to ask for.
  it("omits the contact email entirely when the customer has none", () => {
    const dto = createOrderValuesToDto(values({ contactEmail: "" }), LINES);

    expect(dto.contact).toEqual({
      name: "Олена Шевченко",
      phone: "+380501234567",
    });
    // Not `email: ""` — an empty string is not an address, and the DTO would have
    // to guess which of the two we meant.
    expect(dto.contact).not.toHaveProperty("email");
  });
});

describe("createOrderValuesToDto — prices are never client-supplied (TASK-341)", () => {
  it("sends only productId and quantity per line", () => {
    const dto = createOrderValuesToDto(values(), LINES);

    // The picker shows a price so the operator can read a total back over the
    // phone. It must not travel: an operator-created order is still a sale at
    // the shop's price, and a price field here would make every discount a
    // matter of who happened to answer, with no record it was given.
    expect(dto.items).toEqual([{ productId: "prod-1", quantity: 2 }]);
    expect(JSON.stringify(dto)).not.toContain("499.00");
  });

  it("omits blank optional fields rather than sending empty strings", () => {
    const dto = createOrderValuesToDto(values(), LINES);

    expect(dto).not.toHaveProperty("notes");
    expect(dto).not.toHaveProperty("internalNotes");
    expect(dto.shippingAddress).not.toHaveProperty("postalCode");
  });
});

// ─── Nova Poshta refs (TASK-426) ───────────────────────────────────────────────

describe("createOrderValuesToDto — Nova Poshta refs", () => {
  it("sends the refs when the address came from the directory", () => {
    const dto = createOrderValuesToDto(
      values({
        deliveryMethod: "NOVA_POSHTA",
        npCityRef: "db5c88e0-391c-11dd-90d9-001a92567626",
        npWarehouseRef: "7b422fc6-e1b8-11e3-8c4a-0050568002cf",
      }),
      LINES,
    );

    expect(dto.shippingAddress.npCityRef).toBe(
      "db5c88e0-391c-11dd-90d9-001a92567626",
    );
    expect(dto.shippingAddress.npWarehouseRef).toBe(
      "7b422fc6-e1b8-11e3-8c4a-0050568002cf",
    );
    // The chosen branch's description IS the address line, so it doubles as the
    // NP warehouse name — mirroring what the storefront checkout sends.
    expect(dto.shippingAddress.npWarehouseName).toBe("Відділення №12");
  });

  it("omits them for a hand-typed address", () => {
    // The normal state of a deployment with no Nova Poshta key: the directory is
    // unreachable, the operator types the address, and the order still goes.
    const dto = createOrderValuesToDto(values(), LINES);

    expect(dto.shippingAddress).not.toHaveProperty("npCityRef");
    expect(dto.shippingAddress).not.toHaveProperty("npWarehouseRef");
    expect(dto.shippingAddress).not.toHaveProperty("npWarehouseName");
  });

  it("does not claim a warehouse ref just because a city was picked", () => {
    const dto = createOrderValuesToDto(
      values({
        deliveryMethod: "NOVA_POSHTA",
        npCityRef: "db5c88e0-391c-11dd-90d9-001a92567626",
      }),
      LINES,
    );

    expect(dto.shippingAddress.npCityRef).toBeDefined();
    expect(dto.shippingAddress).not.toHaveProperty("npWarehouseRef");
    expect(dto.shippingAddress).not.toHaveProperty("npWarehouseName");
  });
});

describe("createOrderSchema — contact validation follows the chosen mode", () => {
  const parse = (v: CreateOrderFormValues) => createOrderSchema.safeParse(v);
  const issuePaths = (v: CreateOrderFormValues) =>
    parse(v).error?.issues.map((issue) => issue.path[0]) ?? [];

  it("accepts a walk-in with a full contact block", () => {
    expect(parse(values()).success).toBe(true);
  });

  it("does not demand a picked account from a walk-in", () => {
    // Switching to «за телефоном» must not leave a stale account error onscreen.
    expect(parse(values({ userId: "not-a-uuid" })).success).toBe(true);
  });

  it("demands a picked account in account mode", () => {
    // No human types this value any more (TASK-426) — it comes from the customer
    // picker — so the rule is a guard against a broken picker, and the message
    // points at the list rather than at a UUID format.
    const result = parse(
      values({ customerMode: CUSTOMER_MODE.ACCOUNT, userId: "" }),
    );

    expect(result.success).toBe(false);
    expect(
      issuePaths(values({ customerMode: CUSTOMER_MODE.ACCOUNT })),
    ).toContain("userId");
  });

  it("does not demand contact details in account mode", () => {
    expect(
      parse(
        values({
          customerMode: CUSTOMER_MODE.ACCOUNT,
          userId: PICKED_USER_ID,
          contactName: "",
          contactEmail: "",
          contactPhone: "",
        }),
      ).success,
    ).toBe(true);
  });

  it("refuses an order nobody can be reached about", () => {
    const result = parse(values({ contactEmail: "", contactPhone: "" }));

    expect(result.success).toBe(false);
    expect(
      issuePaths(values({ contactEmail: "", contactPhone: "" })),
    ).toContain("contactPhone");
  });

  it("requires the address fields the courier cannot deliver without", () => {
    expect(parse(values({ city: "" })).success).toBe(false);
    expect(parse(values({ address1: "" })).success).toBe(false);
    expect(parse(values({ phone: "" })).success).toBe(false);
  });

  // ─── TASK-426: the phone rule, and the country it must NOT assume ────────────

  describe("phone numbers", () => {
    it("accepts a walk-in with a phone but no email at all", () => {
      expect(parse(values({ contactEmail: "" })).success).toBe(true);
    });

    it("still refuses an email that IS given but is malformed", () => {
      expect(issuePaths(values({ contactEmail: "олена@" }))).toContain(
        "contactEmail",
      );
    });

    it.each([
      ["123456", "the six characters the old length >= 6 rule accepted"],
      ["+380 50 123", "a half-typed number"],
      ["(((((((((((", "punctuation only"],
      ["050 123 45 67 дзвонити після 18", "a number with a note stuck to it"],
    ])("refuses %s as a contact phone (%s)", (phone) => {
      expect(issuePaths(values({ contactPhone: phone }))).toContain(
        "contactPhone",
      );
    });

    it.each([
      ["+380 50 123 4567", "the spelling the storefront posts"],
      ["0501234567", "domestic leading zero"],
      ["+38 (050) 123-45-67", "brackets and dashes"],
    ])("accepts %s as a contact phone (%s)", (phone) => {
      expect(parse(values({ contactPhone: phone })).success).toBe(true);
    });

    /**
     * The regression this block exists for. The first cut of TASK-426 judged both
     * phones with `isValidUAPhone`, so the admin form refused numbers the API
     * accepts on purpose: `AddressDto.phone` and `GuestContactDto.phone` carry
     * `@IsInternationalPhone` because an operator taking an order by phone may be
     * given a roaming or border-region number (TASK-338, restated by the owner
     * 2026-09-10). A form stricter than its endpoint is a capability the owner
     * carved out and the panel then took away.
     */
    it.each([
      ["+48 123 456 789", "a Polish border-region number"],
      ["+1 234 567 8901", "a foreign number the +380 mask used to truncate"],
      ["+1 (212) 555-0123", "brackets on a foreign number"],
      ["+49 30 123456789", "a 13-digit German number"],
    ])("accepts %s for BOTH phones (%s)", (phone) => {
      expect(parse(values({ contactPhone: phone, phone: phone })).success).toBe(
        true,
      );
    });

    it("applies the same rule to the RECIPIENT phone, in both modes", () => {
      expect(issuePaths(values({ phone: "123456" }))).toContain("phone");
      expect(
        issuePaths(
          values({
            customerMode: CUSTOMER_MODE.ACCOUNT,
            userId: PICKED_USER_ID,
            phone: "123456",
          }),
        ),
      ).toContain("phone");
    });

    it("reports an empty recipient phone once, as a missing field", () => {
      // Not twice: "обовʼязкове поле" AND "wrong format" for the same blank input
      // is two messages for one mistake.
      expect(
        issuePaths(values({ phone: "" })).filter((path) => path === "phone"),
      ).toHaveLength(1);
    });
  });
});

// TASK-794: a bare `max()` blocked the submit with nothing on screen. The limits
// are the DTO's, and each refusal now carries the sentence the form renders.
describe("createOrderSchema — note lengths name themselves (TASK-794)", () => {
  const issueFor = (v: CreateOrderFormValues, path: string) => {
    const result = createOrderSchema.safeParse(v);
    if (result.success) return undefined;
    return result.error.issues.find((issue) => issue.path[0] === path);
  };

  it("accepts the customer note at exactly the limit", () => {
    expect(
      issueFor(values({ notes: "н".repeat(NOTES_MAX_LENGTH) }), "notes"),
    ).toBeUndefined();
  });

  it("refuses one character more, with the sentence the form shows", () => {
    expect(
      issueFor(values({ notes: "н".repeat(NOTES_MAX_LENGTH + 1) }), "notes")
        ?.message,
    ).toBe(dict.orderCreate.notesTooLong);
  });

  it("does the same for the internal note at its own, larger limit", () => {
    expect(
      issueFor(
        values({ internalNotes: "н".repeat(INTERNAL_NOTES_MAX_LENGTH) }),
        "internalNotes",
      ),
    ).toBeUndefined();
    expect(
      issueFor(
        values({ internalNotes: "н".repeat(INTERNAL_NOTES_MAX_LENGTH + 1) }),
        "internalNotes",
      )?.message,
    ).toBe(dict.orderCreate.internalNotesTooLong);
  });
});

// ─── TASK-1973 / 1019 / 1808: the operator chooses the delivery method ─────────

describe("createOrderSchema — delivery method (TASK-1973)", () => {
  const t = dict.orderCreate;
  const POINT_ID = "6f1c1f4e-6d8c-4c86-9d57-2a3f5f0c9a11";
  const issue = (v: CreateOrderFormValues, path: string) =>
    createOrderSchema.safeParse(v).error?.issues.find((i) => i.path[0] === path)
      ?.message;

  it("starts on Nova Poshta", () => {
    expect(CREATE_ORDER_DEFAULTS.deliveryMethod).toBe("NOVA_POSHTA");
  });

  it("asks for a city from the directory on Nova Poshta", () => {
    const v = values({ deliveryMethod: "NOVA_POSHTA", npCityRef: "" });
    expect(issue(v, "city")).toBe(t.deliveryNpCityRequired);
    expect(
      createOrderSchema.safeParse({ ...v, npCityRef: "city-ref" }).success,
    ).toBe(true);
  });

  it("asks for a point — not an address — on pickup", () => {
    const v = values({ deliveryMethod: "PICKUP", city: "", address1: "" });
    expect(issue(v, "pickupPointId")).toBe(t.deliveryPickupRequired);
    expect(issue(v, "city")).toBeUndefined();
    expect(issue(v, "address1")).toBeUndefined();
    expect(
      createOrderSchema.safeParse({ ...v, pickupPointId: POINT_ID }).success,
    ).toBe(true);
  });

  it("still asks for the address on OTHER", () => {
    expect(issue(values({ city: "" }), "city")).toBe(t.addressRequired);
  });

  it.each(["", "0", "150", "150,5", "99.99"])(
    "accepts an agreed OTHER cost of %p",
    (shippingCost) => {
      expect(
        createOrderSchema.safeParse(values({ shippingCost })).success,
      ).toBe(true);
    },
  );

  it.each(["-1", "abc", "1.234", "100001"])(
    "refuses an agreed OTHER cost of %p",
    (shippingCost) => {
      expect(issue(values({ shippingCost }), "shippingCost")).toBe(
        t.shippingCostInvalid,
      );
    },
  );

  it("does not judge a cost left behind on another method", () => {
    expect(
      createOrderSchema.safeParse(
        values({
          deliveryMethod: "NOVA_POSHTA",
          npCityRef: "city-ref",
          shippingCost: "abc",
        }),
      ).success,
    ).toBe(true);
  });
});

describe("createOrderValuesToDto — delivery method (TASK-1973)", () => {
  const POINT_ID = "6f1c1f4e-6d8c-4c86-9d57-2a3f5f0c9a11";

  it("always says which method it is", () => {
    expect(createOrderValuesToDto(values(), LINES).deliveryMethod).toBe(
      "OTHER",
    );
  });

  it("sends the pickup point, and no NP refs or cost", () => {
    const dto = createOrderValuesToDto(
      values({
        deliveryMethod: "PICKUP",
        pickupPointId: POINT_ID,
        npCityRef: "stale-ref",
        shippingCost: "50",
      }),
      LINES,
    );
    expect(dto).toMatchObject({
      deliveryMethod: "PICKUP",
      pickupPointId: POINT_ID,
    });
    expect(dto).not.toHaveProperty("shippingCost");
    expect(dto.shippingAddress).not.toHaveProperty("npCityRef");
  });

  it("sends an agreed OTHER cost as a number, comma or dot", () => {
    expect(
      createOrderValuesToDto(values({ shippingCost: "150,5" }), LINES)
        .shippingCost,
    ).toBe(150.5);
    expect(createOrderValuesToDto(values(), LINES)).not.toHaveProperty(
      "shippingCost",
    );
  });

  it("never sends NP refs or a pickup point on OTHER", () => {
    const dto = createOrderValuesToDto(
      values({
        npCityRef: "stale-ref",
        npWarehouseRef: "stale-wh",
        pickupPointId: POINT_ID,
      }),
      LINES,
    );
    expect(dto.shippingAddress).not.toHaveProperty("npCityRef");
    expect(dto.shippingAddress).not.toHaveProperty("npWarehouseRef");
    expect(dto).not.toHaveProperty("pickupPointId");
  });

  it("never sends a cost on Nova Poshta", () => {
    const dto = createOrderValuesToDto(
      values({
        deliveryMethod: "NOVA_POSHTA",
        npCityRef: "city-ref",
        shippingCost: "80",
      }),
      LINES,
    );
    expect(dto).not.toHaveProperty("shippingCost");
  });
});

describe("operatorShippingCost — what the summary adds to the total (TASK-1808)", () => {
  const courier = { price: "120.00", freeFrom: "1000.00", cityName: "Київ" };

  it("adds nothing for Nova Poshta — paid at the branch (B-13)", () => {
    expect(
      operatorShippingCost(
        values({ deliveryMethod: "NOVA_POSHTA" }),
        courier,
        500,
      ),
    ).toEqual({ kind: "carrier" });
  });

  it("is free for pickup", () => {
    expect(
      operatorShippingCost(values({ deliveryMethod: "PICKUP" }), courier, 500),
    ).toEqual({ kind: "amount", amount: 0 });
  });

  it("charges the courier until its threshold", () => {
    expect(
      operatorShippingCost(values({ deliveryMethod: "COURIER" }), courier, 500),
    ).toEqual({ kind: "amount", amount: 120 });
    expect(
      operatorShippingCost(
        values({ deliveryMethod: "COURIER" }),
        courier,
        1000,
      ),
    ).toEqual({ kind: "amount", amount: 0 });
  });

  it("is still to be agreed when the courier terms are not loaded (review R3)", () => {
    expect(
      operatorShippingCost(
        values({ deliveryMethod: "COURIER" }),
        undefined,
        500,
      ),
    ).toEqual({ kind: "pending" });
  });

  it("is the agreed cost for OTHER, or still to be agreed", () => {
    expect(
      operatorShippingCost(values({ shippingCost: "150,5" }), courier, 500),
    ).toEqual({ kind: "amount", amount: 150.5 });
    expect(operatorShippingCost(values(), courier, 500)).toEqual({
      kind: "pending",
    });
  });
});

describe("allowedPaymentMethods — the admin matrix (TASK-1973)", () => {
  const matrix = {
    NOVA_POSHTA: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
    PICKUP: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
    COURIER: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
    OTHER: ["ON_DELIVERY"],
  };

  it("adds the bank transfer to every method", () => {
    expect(allowedPaymentMethods("OTHER", matrix)).toEqual([
      "ON_DELIVERY",
      "BANK_TRANSFER",
    ]);
    expect(allowedPaymentMethods("PICKUP", matrix)).toContain("ONLINE");
  });

  it("falls back to the shop's table while the served one is loading", () => {
    expect(allowedPaymentMethods("OTHER", undefined)).toEqual([
      "ON_DELIVERY",
      "BANK_TRANSFER",
    ]);
    expect(allowedPaymentMethods("NOVA_POSHTA", undefined)).toContain(
      "INSTALLMENTS",
    );
  });
});
