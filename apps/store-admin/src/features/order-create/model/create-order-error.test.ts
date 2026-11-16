import { dict } from "@/shared/config";
import { mapServerFieldErrors } from "@/shared/lib/form-errors";
import {
  CREATE_ORDER_FIELD_MESSAGES,
  createOrderFieldMap,
  readCreateOrderRefusal,
} from "./create-order-error";

const t = dict.orderCreate;

const LINES = [
  {
    productId: "p-1",
    productName: "Силіконовий чохол",
    price: "1299",
    quantity: 2,
  },
  {
    productId: "p-2",
    productName: "Захисне скло 9H",
    price: "349",
    quantity: 1,
  },
];

const refusal = (status: number, message: string | string[]) => ({
  response: { status, data: { message, statusCode: status } },
});

const withFields = (
  fieldErrors: Array<{ field: string; constraint: string }>,
) => ({
  response: {
    status: 400,
    data: { statusCode: 400, message: "Bad Request", fieldErrors },
  },
});

// TASK-2048: the original of a copy left pre-shipment before «Створити».
describe("readCreateOrderRefusal — a copy whose original moved on", () => {
  it("says the original can no longer be cancelled with the copy", () => {
    expect(
      readCreateOrderRefusal(
        {
          response: {
            status: 409,
            data: {
              statusCode: 409,
              error: "ORDER_COPY_ORIGINAL_NOT_CANCELLABLE",
              message: "The original order is SHIPPED now",
            },
          },
        },
        LINES,
      ),
    ).toEqual({ lines: {}, summary: t.copyOriginalGone });
  });

  it("leaves any other 409 to the caller", () => {
    expect(readCreateOrderRefusal(refusal(409, "nope"), LINES)).toBeNull();
  });
});

describe("readCreateOrderRefusal — a 400 placed where it can be fixed (Н3)", () => {
  it("puts a stock refusal under the line it names, with the free count", () => {
    const result = readCreateOrderRefusal(
      refusal(400, 'Insufficient stock for "Захисне скло 9H" — 0 available'),
      LINES,
    );
    expect(result?.lines).toEqual({ "p-2": t.lineStockGone(0) });
    expect(result?.summary).toBe(t.serverErrorLine);
  });

  it("marks a product that stopped being sold", () => {
    const result = readCreateOrderRefusal(
      refusal(400, 'Product "Силіконовий чохол" is no longer available'),
      LINES,
    );
    expect(result?.lines).toEqual({ "p-1": t.lineUnavailable });
  });

  it("says nothing in the summary when every field error was placed", () => {
    const result = readCreateOrderRefusal(
      withFields([{ field: "internalNotes", constraint: "maxLength" }]),
      LINES,
      { mapped: ["internalNotes"], unmapped: [] },
    );
    expect(result).toEqual({ lines: {}, summary: null });
  });

  it("keeps the general sentence for a remainder nobody could place", () => {
    const result = readCreateOrderRefusal(
      withFields([{ field: "paymentMethod", constraint: "isEnum" }]),
      LINES,
      {
        mapped: ["notes"],
        unmapped: [{ field: "paymentMethod", constraint: "isEnum" }],
      },
    );
    expect(result?.summary).toBe(t.failedBadRequest);
  });

  it("falls back to the general sentence when nothing can be placed", () => {
    const result = readCreateOrderRefusal(
      refusal(400, "That customer account does not exist"),
      LINES,
    );
    expect(result).toEqual({ lines: {}, summary: t.failedBadRequest });
  });

  it("is not about a 400 when it is not one", () => {
    expect(readCreateOrderRefusal(refusal(500, "boom"), LINES)).toBeNull();
  });

  // TASK-1021: the delivery × payment matrix answers in Ukrainian, for the
  // operator, under a stable code — that sentence is the summary.
  it("shows a DELIVERY_* refusal in the server's own words", () => {
    const message =
      "Для адреси без міста зі списку Нової Пошти вартість доставки ще не відома — оберіть оплату при отриманні";
    const result = readCreateOrderRefusal(
      {
        response: {
          status: 400,
          data: {
            statusCode: 400,
            error: "DELIVERY_PAYMENT_NOT_ALLOWED",
            message,
          },
        },
      },
      LINES,
    );
    expect(result).toEqual({ lines: {}, summary: message });
  });
});

describe("createOrderFieldMap — the DTO path → the field on screen (TASK-1984)", () => {
  const map = (
    fieldErrors: Array<{ field: string; constraint: string }>,
    sameRecipient = true,
    method: "NOVA_POSHTA" | "PICKUP" | "OTHER" = "OTHER",
  ) =>
    mapServerFieldErrors(
      withFields(fieldErrors),
      createOrderFieldMap(sameRecipient, method),
      CREATE_ORDER_FIELD_MESSAGES,
    );

  it("puts the recipient's refusal on the client block while it IS the recipient", () => {
    expect(
      map([
        { field: "shippingAddress.lastName", constraint: "isNotEmpty" },
        { field: "shippingAddress.phone", constraint: "isInternationalPhone" },
      ]),
    ).toEqual({
      contactLastName: dict.forms.required,
      contactPhone: dict.forms.phoneInvalid,
    });
  });

  it("puts it on the recipient fields once they are on screen", () => {
    expect(
      map(
        [{ field: "shippingAddress.firstName", constraint: "maxLength" }],
        false,
      ),
    ).toEqual({ firstName: dict.forms.tooLong });
  });

  it("maps the walk-in contact and the email", () => {
    expect(
      map([
        { field: "contact.email", constraint: "isEmail" },
        { field: "contact.name", constraint: "maxLength" },
      ]),
    ).toEqual({
      contactEmail: dict.forms.emailInvalid,
      contactFirstName: dict.forms.tooLong,
    });
  });

  it("keeps the notes' own wording", () => {
    expect(map([{ field: "notes", constraint: "maxLength" }])).toEqual({
      notes: t.notesTooLong,
    });
  });

  it("puts a pickup order's address refusal on the point", () => {
    expect(
      map(
        [{ field: "shippingAddress.city", constraint: "isNotEmpty" }],
        true,
        "PICKUP",
      ),
    ).toEqual({ pickupPointId: dict.forms.required });
  });
});
