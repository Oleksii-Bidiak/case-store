import { dict } from "@/shared/config";
import { readReturnRequestError } from "./return-error";

function apiError(status: number, error?: string) {
  return {
    response: {
      status,
      data: {
        statusCode: status,
        ...(error ? { error } : {}),
        message: "Cannot return 2 of that item — 0 remain returnable",
      },
    },
  };
}

describe("readReturnRequestError (TASK-1964)", () => {
  // The double request: the units are already in another live request. Saying
  // «спробуйте ще раз» here sends the customer round the same loop — the form
  // reloads what is left instead and says why.
  it("says the item is already claimed and asks for a fresh ledger", () => {
    expect(
      readReturnRequestError(apiError(400, "RETURN_QUANTITY_EXCEEDED")),
    ).toEqual({
      message: dict.returnRequest.errors.quantityExceeded,
      refreshLedger: true,
    });
  });

  it("refreshes the ledger when a line is not in the order any more", () => {
    expect(
      readReturnRequestError(apiError(400, "RETURN_ITEM_NOT_IN_ORDER")),
    ).toEqual({
      message: dict.returnRequest.errors.itemNotInOrder,
      refreshLedger: true,
    });
  });

  it.each([
    [
      "RETURN_ORDER_NOT_RETURNABLE",
      dict.returnRequest.errors.orderNotReturnable,
    ],
    ["RETURN_ORDER_NOT_FOUND", dict.returnRequest.errors.orderNotFound],
  ])("maps %s to its own sentence", (code, message) => {
    expect(readReturnRequestError(apiError(400, code))).toEqual({
      message,
      refreshLedger: false,
    });
  });

  // SF-ACC-31: the rate limit, a 500, an unknown code — the same numbers may
  // well work a minute later, so the instruction is «try again». The English
  // server message is never shown.
  it.each([
    [apiError(429)],
    [apiError(500)],
    [apiError(400)],
    [apiError(409, "SOMETHING_NEW")],
    [new Error("boom")],
  ])("falls back to «try again» for anything else", (error) => {
    expect(readReturnRequestError(error)).toEqual({
      message: dict.returnRequest.error,
      refreshLedger: false,
    });
  });
});
