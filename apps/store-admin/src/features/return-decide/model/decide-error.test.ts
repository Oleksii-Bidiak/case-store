import { dict } from "@/shared/config";
import { decideErrorOf } from "./decide-error";

const d = dict.returns;

/** An axios-shaped failure, the way the API's exception filter answers. */
function failure(status: number, error: string, message = "msg") {
  return {
    response: { status, data: { statusCode: status, error, message } },
  };
}

describe("decideErrorOf — the decide endpoint's refusals in Ukrainian (TASK-2044)", () => {
  it("puts a missing reason under the reason field", () => {
    expect(
      decideErrorOf(failure(400, "RETURN_DECISION_REASON_REQUIRED")),
    ).toEqual({
      kind: "field",
      field: "reason",
      message: d.decideReasonRequired,
    });
  });

  it("puts an unchanged decision under the reason field — that is what to edit", () => {
    expect(decideErrorOf(failure(409, "RETURN_DECISION_UNCHANGED"))).toEqual({
      kind: "field",
      field: "reason",
      message: d.decideUnchanged,
    });
  });

  it("says the decision is locked after a refund, and refetches", () => {
    expect(decideErrorOf(failure(409, "RETURN_DECISION_LOCKED"))).toEqual({
      kind: "toast",
      message: d.decideLocked,
      refetch: true,
    });
  });

  it("explains a re-open refused because the units were claimed again", () => {
    expect(decideErrorOf(failure(409, "RETURN_QUANTITY_EXCEEDED"))).toEqual({
      kind: "toast",
      message: d.decideQuantityExceeded,
      refetch: true,
    });
  });

  it("treats an invalid transition, or any other 409, as «the return moved»", () => {
    for (const code of ["RETURN_TRANSITION_INVALID", "Conflict"]) {
      expect(decideErrorOf(failure(409, code))).toEqual({
        kind: "toast",
        message: d.decideConflict,
        refetch: true,
      });
    }
  });

  it("says the return is gone on a 404", () => {
    expect(decideErrorOf(failure(404, "RETURN_NOT_FOUND"))).toEqual({
      kind: "toast",
      message: d.decideNotFound,
      refetch: true,
    });
  });

  it("puts a DTO length refusal of the reason under the field", () => {
    expect(
      decideErrorOf(
        failure(
          400,
          "Bad Request",
          "reason must be shorter than or equal to 1000 characters",
        ),
      ),
    ).toEqual({
      kind: "field",
      field: "reason",
      message: d.decideReasonTooLong,
    });
  });

  it("does not trust a code on the wrong status — the status decides", () => {
    // A 500 that happens to carry a known code is still a failure to save.
    expect(decideErrorOf(failure(500, "RETURN_DECISION_LOCKED"))).toEqual({
      kind: "toast",
      message: d.decideFailed,
      refetch: false,
    });
    expect(decideErrorOf(new Error("network"))).toEqual({
      kind: "toast",
      message: d.decideFailed,
      refetch: false,
    });
  });
});
