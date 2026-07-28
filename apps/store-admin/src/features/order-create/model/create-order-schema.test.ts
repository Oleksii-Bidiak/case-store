import {
  CREATE_ORDER_DEFAULTS,
  CUSTOMER_MODE,
  createOrderSchema,
  createOrderValuesToDto,
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
        userId: "550e8400-e29b-41d4-a716-446655440001",
      }),
      LINES,
    );

    expect(dto.userId).toBe("550e8400-e29b-41d4-a716-446655440001");
    expect(dto).not.toHaveProperty("contact");
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

describe("createOrderSchema — contact validation follows the chosen mode", () => {
  const parse = (v: CreateOrderFormValues) => createOrderSchema.safeParse(v);

  it("accepts a walk-in with a full contact block", () => {
    expect(parse(values()).success).toBe(true);
  });

  it("does not demand a UUID from a walk-in", () => {
    // Switching to «за телефоном» must not leave a stale userId error onscreen.
    expect(parse(values({ userId: "not-a-uuid" })).success).toBe(true);
  });

  it("demands a real UUID in account mode", () => {
    const result = parse(
      values({ customerMode: CUSTOMER_MODE.ACCOUNT, userId: "12345" }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path[0] === "userId")).toBe(true);
  });

  it("does not demand contact details in account mode", () => {
    expect(
      parse(
        values({
          customerMode: CUSTOMER_MODE.ACCOUNT,
          userId: "550e8400-e29b-41d4-a716-446655440001",
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
  });

  it("requires the address fields the courier cannot deliver without", () => {
    expect(parse(values({ city: "" })).success).toBe(false);
    expect(parse(values({ address1: "" })).success).toBe(false);
    expect(parse(values({ phone: "" })).success).toBe(false);
  });
});
