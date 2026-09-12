import {
  createOrderDetailsSchema,
  isValidWaybill,
  isWaybillRejection,
  mapOrderToDetailsValues,
  orderDetailsValuesToDto,
  type OrderDetailsFormValues,
} from "./order-details-schema";

const UPDATED_AT = "2026-06-01T10:00:00.000Z";
const WAYBILL = "20450000000001";
/** What TASK-335 let operators type before the 14-digit rule existed. */
const LEGACY = "ТТН уточнюється";

function values(
  overrides: Partial<OrderDetailsFormValues> = {},
): OrderDetailsFormValues {
  return { trackingNumber: "", internalNotes: "", ...overrides };
}

describe("isValidWaybill (TASK-426)", () => {
  it.each([
    [WAYBILL, "as it is stored"],
    ["2045 0000 0000 01", "as it is pasted out of the NP interface"],
    ["2045-0000-0000-01", "with dashes"],
  ])("accepts %s (%s)", (raw) => {
    expect(isValidWaybill(raw)).toBe(true);
  });

  it.each([
    ["123", "a short number typed under TASK-335"],
    [LEGACY, "a note where the waybill belongs"],
    ["--------------", "fourteen characters and no waybill at all"],
    ["204500000000012", "fifteen digits"],
  ])("refuses %s (%s)", (raw) => {
    expect(isValidWaybill(raw)).toBe(false);
  });
});

describe("createOrderDetailsSchema — the waybill rule", () => {
  const parse = (
    seeded: string,
    v: OrderDetailsFormValues,
  ): { success: boolean } => createOrderDetailsSchema(seeded).safeParse(v);

  it("accepts a real waybill", () => {
    expect(parse("", values({ trackingNumber: WAYBILL })).success).toBe(true);
  });

  it("still accepts a blank field — a waybill is assigned later", () => {
    expect(parse("", values()).success).toBe(true);
  });

  it("refuses a newly typed value that is not 14 digits", () => {
    expect(parse("", values({ trackingNumber: "123" })).success).toBe(false);
  });

  /**
   * The regression this rule must not cause. An order created before the rule
   * existed carries a value that does not satisfy it; a flat rule would mark the
   * whole form invalid the moment the page loads, and the operator could then
   * never save the INTERNAL NOTES either — a field they can edit, blocked by a
   * field they never touched.
   */
  it("grandfathers the value the order already had", () => {
    expect(parse(LEGACY, values({ trackingNumber: LEGACY })).success).toBe(
      true,
    );
    // …including the notes beside it, which is the point.
    expect(
      parse(
        LEGACY,
        values({ trackingNumber: LEGACY, internalNotes: "Передзвонити" }),
      ).success,
    ).toBe(true);
  });

  it("does not grandfather a DIFFERENT bad value on the same order", () => {
    // Touching the field at all means the new value must be a real waybill.
    expect(parse(LEGACY, values({ trackingNumber: "123" })).success).toBe(
      false,
    );
  });

  it("lets a legacy value be cleared", () => {
    expect(parse(LEGACY, values({ trackingNumber: "" })).success).toBe(true);
  });
});

describe("orderDetailsValuesToDto — what actually travels (TASK-426)", () => {
  it("omits an unchanged waybill, so an unrelated save is not judged by it", () => {
    const seeded = mapOrderToDetailsValues({
      trackingNumber: LEGACY,
      internalNotes: null,
    });

    const dto = orderDetailsValuesToDto(
      values({ trackingNumber: LEGACY, internalNotes: "Передзвонити" }),
      seeded,
      UPDATED_AT,
    );

    // An omitted key means "leave it alone" — the repository builds its Prisma
    // `data` from the keys that are present. Sending the legacy value back is
    // what made this PATCH 400 on a field the operator never touched.
    expect(dto).not.toHaveProperty("trackingNumber");
    expect(dto.internalNotes).toBe("Передзвонити");
    expect(dto.expectedUpdatedAt).toBe(UPDATED_AT);
  });

  it("sends a waybill the operator actually typed", () => {
    const dto = orderDetailsValuesToDto(
      values({ trackingNumber: WAYBILL }),
      values(),
      UPDATED_AT,
    );

    expect(dto.trackingNumber).toBe(WAYBILL);
  });

  it("sends null when a waybill is cleared — blank means cleared, not omitted", () => {
    const dto = orderDetailsValuesToDto(
      values(),
      values({ trackingNumber: WAYBILL }),
      UPDATED_AT,
    );

    expect(dto).toHaveProperty("trackingNumber");
    expect(dto.trackingNumber).toBeNull();
  });

  it("does not mistake a re-typed identical value for a change", () => {
    const dto = orderDetailsValuesToDto(
      values({ trackingNumber: ` ${WAYBILL} ` }),
      values({ trackingNumber: WAYBILL }),
      UPDATED_AT,
    );

    expect(dto).not.toHaveProperty("trackingNumber");
  });

  it("still always sends the internal notes, blank included", () => {
    const dto = orderDetailsValuesToDto(
      values(),
      values({ internalNotes: "стара нотатка" }),
      UPDATED_AT,
    );

    expect(dto).toHaveProperty("internalNotes");
    expect(dto.internalNotes).toBeNull();
  });
});

describe("isWaybillRejection — naming the field the server refused", () => {
  const rejection = (status: number, message: unknown) => ({
    response: { status, data: { message } },
  });

  it("recognises the DTO failure class-validator sends back", () => {
    expect(
      isWaybillRejection(
        rejection(400, [
          "trackingNumber: A Nova Poshta waybill (ТТН) is exactly 14 digits",
        ]),
      ),
    ).toBe(true);
  });

  it("leaves other 400s to the generic message", () => {
    expect(
      isWaybillRejection(rejection(400, ["internalNotes is too long"])),
    ).toBe(false);
  });

  it("is not fooled by a conflict or a network failure", () => {
    expect(isWaybillRejection(rejection(409, ["ORDER_STALE"]))).toBe(false);
    expect(isWaybillRejection({})).toBe(false);
    expect(isWaybillRejection(undefined)).toBe(false);
  });
});
