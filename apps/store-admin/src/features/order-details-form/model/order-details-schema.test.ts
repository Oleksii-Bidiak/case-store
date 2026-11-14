import { dict } from "@/shared/config";
import { mapServerFieldErrors } from "@/shared/lib/form-errors";
import {
  ORDER_DETAILS_FIELD_MAP,
  ORDER_DETAILS_FIELD_MESSAGES,
  createOrderDetailsSchema,
  isValidWaybill,
  mapOrderToDetailsValues,
  npTrackingUrl,
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

describe("npTrackingUrl (TASK-1987)", () => {
  it("puts the waybill in the path, the only form NP's page still fills in", () => {
    expect(npTrackingUrl(WAYBILL)).toBe(
      "https://novaposhta.ua/tracking/20450000000001",
    );
  });

  it("keeps digits only — the spaces an operator pastes are not part of it", () => {
    expect(npTrackingUrl(" 2045 0000 0000 01 ")).toBe(
      "https://novaposhta.ua/tracking/20450000000001",
    );
  });

  it.each([[LEGACY], ["--------------"], [""]])(
    "gives no link for %p, which holds no digits at all",
    (raw) => {
      expect(npTrackingUrl(raw)).toBeNull();
    },
  );
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

describe("ORDER_DETAILS_FIELD_MAP — the field the server refused (TASK-1984)", () => {
  const rejection = (
    message: unknown,
    fieldErrors?: Array<{ field: string; constraint: string }>,
  ) => ({
    response: { status: 400, data: { message, fieldErrors } },
  });
  const place = (error: unknown) =>
    mapServerFieldErrors(
      error,
      ORDER_DETAILS_FIELD_MAP,
      ORDER_DETAILS_FIELD_MESSAGES,
    );

  it("reads the field from fieldErrors, in our words", () => {
    expect(
      place(
        rejection(
          ["whatever"],
          [
            { field: "trackingNumber", constraint: "isNovaPoshtaWaybill" },
            { field: "internalNotes", constraint: "maxLength" },
          ],
        ),
      ),
    ).toEqual({
      trackingNumber: dict.orders.trackingNumberInvalid,
      internalNotes: dict.orders.internalNotesInvalid,
    });
  });

  it("no longer guesses the field from the English message", () => {
    expect(
      place(
        rejection([
          "trackingNumber: A Nova Poshta waybill (ТТН) is exactly 14 digits",
        ]),
      ),
    ).toEqual({});
  });
});
