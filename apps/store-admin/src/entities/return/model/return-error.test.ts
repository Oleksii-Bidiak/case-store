import { dict } from "@/shared/config";
import {
  RETURN_ERROR_CODE,
  returnRefusalOf,
  returnRemainingOf,
} from "./return-error";

const d = dict.returns;

/** An axios-shaped failure, the way the API's exception filter answers. */
function failure(status: number, error: string, message = "msg") {
  return {
    response: { status, data: { statusCode: status, error, message } },
  };
}

/** «Спробуйте ще раз» — the copy a refusal that cannot succeed must never get. */
const RETRY = /Спробуйте ще раз/i;

describe("returnRemainingOf — the units the API says are left (TASK-1966)", () => {
  it("reads the remainder out of RETURN_QUANTITY_EXCEEDED", () => {
    expect(
      returnRemainingOf(
        failure(
          400,
          "RETURN_QUANTITY_EXCEEDED",
          "Cannot return 1 of that item — 0 remain returnable",
        ),
      ),
    ).toBe(0);
    expect(
      returnRemainingOf(
        failure(
          409,
          "RETURN_QUANTITY_EXCEEDED",
          "Cannot return 5 of that item — 2 remain returnable",
        ),
      ),
    ).toBe(2);
  });

  it("is null when the message does not name a number", () => {
    expect(
      returnRemainingOf(failure(400, "RETURN_QUANTITY_EXCEEDED", "reworded")),
    ).toBeNull();
    expect(returnRemainingOf(new Error("network"))).toBeNull();
  });
});

describe("returnRefusalOf — every RETURN_* refusal in Ukrainian (TASK-1966)", () => {
  it("says a double claim is already claimed and how many remain (AD-RET-18)", () => {
    const refusal = returnRefusalOf(
      failure(
        400,
        "RETURN_QUANTITY_EXCEEDED",
        "Cannot return 1 of that item — 0 remain returnable",
      ),
    );

    expect(refusal).toEqual({
      code: RETURN_ERROR_CODE.QUANTITY_EXCEEDED,
      message: d.refusalQuantityExceeded(0),
      refetch: true,
    });
    expect(refusal?.message).toMatch(/вже заявлено/);
    expect(refusal?.message).toMatch(/0/);
    expect(refusal?.message).not.toMatch(RETRY);
  });

  it("still names the claim when the remainder cannot be read", () => {
    expect(
      returnRefusalOf(failure(400, "RETURN_QUANTITY_EXCEEDED", "reworded"))
        ?.message,
    ).toBe(d.refusalQuantityExceeded(null));
    expect(d.refusalQuantityExceeded(null)).toMatch(/вже заявлено/);
  });

  it.each([
    ["RETURN_NOT_FOUND", 404, d.refusalNotFound, true],
    ["RETURN_ORDER_NOT_FOUND", 404, d.refusalOrderNotFound, true],
    ["RETURN_ORDER_NOT_RETURNABLE", 400, d.refusalOrderNotReturnable, true],
    ["RETURN_ITEM_NOT_IN_ORDER", 400, d.refusalItemNotInOrder, true],
    ["RETURN_TRANSITION_INVALID", 409, d.refusalTransitionInvalid, true],
    ["RETURN_ALREADY_RESTOCKED", 409, d.resolveRestockAlreadyDone, true],
    [
      "RETURN_RESTOCK_REQUIRES_RECEIVED",
      400,
      d.refusalRestockRequiresReceived,
      true,
    ],
    [
      "RETURN_REFUND_EXCEEDS_RETURNED_VALUE",
      400,
      d.resolveRefundExceedsReturnedValue(),
      false,
    ],
    [
      "RETURN_REFUND_EXCEEDS_ORDER_BALANCE",
      400,
      d.resolveRefundExceedsOrderBalance(),
      false,
    ],
    ["RETURN_DECISION_REASON_REQUIRED", 400, d.decideReasonRequired, false],
    ["RETURN_DECISION_LOCKED", 409, d.decideLocked, true],
    ["RETURN_DECISION_UNCHANGED", 409, d.decideUnchanged, false],
    ["RETURN_USE_DECISION_ENDPOINT", 400, d.refusalUseDecision, true],
    ["RETURN_REPAIR_STEP_INVALID", 409, d.repairStepInvalid, true],
    ["RETURN_REPAIR_RESULT_REQUIRED", 400, d.repairResultRequired, false],
    ["RETURN_REPAIR_RESULT_NOT_ALLOWED", 400, d.repairStepInvalid, true],
  ])("maps %s to its own sentence", (code, status, message, refetch) => {
    const refusal = returnRefusalOf(failure(status, code, "English prose"));

    expect(refusal).toEqual({ code, message, refetch });
    // None of these is cured by pressing the same button again.
    expect(refusal?.message).not.toMatch(RETRY);
    expect(refusal?.message).not.toContain("English prose");
  });

  it("covers every code the API declares", () => {
    for (const code of Object.values(RETURN_ERROR_CODE)) {
      expect(returnRefusalOf(failure(409, code))).not.toBeNull();
    }
  });

  it("names the missing grant on a 403 rather than «try again»", () => {
    expect(returnRefusalOf(failure(403, "Forbidden"))).toEqual({
      code: null,
      message: d.refusalForbidden,
      refetch: false,
    });
    expect(d.refusalForbidden).not.toMatch(RETRY);
  });

  it("is null for what it does not know — the caller keeps its own copy", () => {
    // An uncoded refusal, a DTO refusal, an unknown code.
    expect(returnRefusalOf(failure(409, "Conflict"))).toBeNull();
    expect(returnRefusalOf(failure(400, "Bad Request"))).toBeNull();
    expect(returnRefusalOf(failure(400, "RETURN_SOMETHING_NEW"))).toBeNull();
    // A network failure has no response at all.
    expect(returnRefusalOf(new Error("network"))).toBeNull();
    expect(returnRefusalOf(undefined)).toBeNull();
  });

  it("does not trust a code on a 5xx — the status decides, the code refines", () => {
    expect(
      returnRefusalOf(failure(500, "RETURN_QUANTITY_EXCEEDED")),
    ).toBeNull();
  });
});
