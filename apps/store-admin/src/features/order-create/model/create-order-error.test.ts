import { dict } from "@/shared/config";
import { readCreateOrderRefusal } from "./create-order-error";

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

  it("puts a notes length refusal under the field, in our words", () => {
    const result = readCreateOrderRefusal(
      refusal(400, [
        "internalNotes must be shorter than or equal to 2000 characters",
      ]),
      LINES,
    );
    expect(result?.fields).toEqual({ internalNotes: t.internalNotesTooLong });
    expect(result?.summary).toBe(t.serverErrorFields);
  });

  it("falls back to the general sentence when nothing can be placed", () => {
    const result = readCreateOrderRefusal(
      refusal(400, "That customer account does not exist"),
      LINES,
    );
    expect(result).toEqual({
      lines: {},
      fields: {},
      summary: t.failedBadRequest,
    });
  });

  it("is not about a 400 when it is not one", () => {
    expect(readCreateOrderRefusal(refusal(500, "boom"), LINES)).toBeNull();
  });
});
