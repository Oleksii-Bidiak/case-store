import { dict } from "@/shared/config";
import { repairErrorOf } from "./repair-error";

const d = dict.returns;

/** An axios-shaped failure, the way the API's exception filter answers. */
function failure(
  status: number,
  error: string,
  message: string | string[] = "msg",
) {
  return {
    response: { status, data: { statusCode: status, error, message } },
  };
}

describe("repairErrorOf — the repair-step refusals in Ukrainian (TASK-2045)", () => {
  it("treats an out-of-order or stale step as a stale page, and refetches", () => {
    expect(
      repairErrorOf(
        failure(409, "RETURN_REPAIR_STEP_INVALID", "The next repair step is X"),
      ),
    ).toEqual({ kind: "toast", message: d.repairStepInvalid, refetch: true });
  });

  it("puts a missing outcome under the outcome radios", () => {
    expect(
      repairErrorOf(failure(400, "RETURN_REPAIR_RESULT_REQUIRED")),
    ).toEqual({
      kind: "field",
      field: "result",
      message: d.repairResultRequired,
    });
  });

  it("reads an outcome refused on this step as a step that moved", () => {
    expect(
      repairErrorOf(failure(400, "RETURN_REPAIR_RESULT_NOT_ALLOWED")),
    ).toEqual({ kind: "toast", message: d.repairStepInvalid, refetch: true });
  });

  it("puts a DTO refusal under the field it names", () => {
    expect(
      repairErrorOf(
        failure(400, "Bad Request", [
          "ttn must be shorter than or equal to 64 characters",
        ]),
      ),
    ).toEqual({ kind: "field", field: "ttn", message: d.repairTtnTooLong });
  });

  it("says the return is gone on a 404", () => {
    expect(repairErrorOf(failure(404, "RETURN_NOT_FOUND"))).toEqual({
      kind: "toast",
      message: d.repairNotFound,
      refetch: true,
    });
  });

  it("falls back to «try again» — a 500 with a known code included", () => {
    expect(
      repairErrorOf(failure(500, "RETURN_REPAIR_RESULT_REQUIRED")),
    ).toEqual({ kind: "toast", message: d.repairFailed, refetch: false });
    expect(repairErrorOf(new Error("network"))).toEqual({
      kind: "toast",
      message: d.repairFailed,
      refetch: false,
    });
  });
});
