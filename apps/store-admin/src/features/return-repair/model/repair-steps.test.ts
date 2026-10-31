import type { ReturnRepairStepEntity } from "@/entities/return";
import { dict } from "@/shared/config";
import {
  isUnrepairable,
  nextRepairStep,
  repairAcceptsSteps,
  repairTimeline,
} from "./repair-steps";

const d = dict.returns;

function step(
  name: ReturnRepairStepEntity["step"],
  overrides: Partial<ReturnRepairStepEntity> = {},
): ReturnRepairStepEntity {
  return {
    step: name,
    result: null,
    destination: null,
    ttn: null,
    createdAt: "2026-10-02T10:00:00.000Z",
    note: null,
    actor: null,
    ...overrides,
  };
}

describe("nextRepairStep — strictly in order (TASK-2045)", () => {
  it("starts with «accepted from the customer»", () => {
    expect(nextRepairStep([])).toBe("ACCEPTED");
  });

  it("follows the recorded prefix", () => {
    expect(nextRepairStep([step("ACCEPTED")])).toBe("SENT_TO_SERVICE");
    expect(
      nextRepairStep([
        step("ACCEPTED"),
        step("SENT_TO_SERVICE"),
        step("RETURNED_FROM_SERVICE"),
      ]),
    ).toBe("HANDED_TO_CUSTOMER");
  });

  it("answers null once the goods are back with the customer", () => {
    expect(
      nextRepairStep([
        step("ACCEPTED"),
        step("SENT_TO_SERVICE"),
        step("RETURNED_FROM_SERVICE"),
        step("HANDED_TO_CUSTOMER"),
      ]),
    ).toBeNull();
  });
});

describe("repairAcceptsSteps — an open return decided as REPAIR", () => {
  it.each([
    ["APPROVED", "REPAIR", true],
    ["RECEIVED", "REPAIR", true],
    ["APPROVED", "REFUND", false],
    ["REJECTED", "REJECT", false],
    ["REFUNDED", "REPAIR", false],
    ["REQUESTED", null, false],
  ] as const)("%s + %s → %s", (status, decision, expected) => {
    expect(repairAcceptsSteps({ status, decision })).toBe(expected);
  });
});

describe("isUnrepairable", () => {
  it("is true only when the service said it cannot be fixed", () => {
    expect(
      isUnrepairable([
        step("RETURNED_FROM_SERVICE", { result: "UNREPAIRABLE" }),
      ]),
    ).toBe(true);
    expect(
      isUnrepairable([step("RETURNED_FROM_SERVICE", { result: "REPAIRED" })]),
    ).toBe(false);
    expect(isUnrepairable([])).toBe(false);
  });
});

describe("repairTimeline — five rows (B-12 §1.7)", () => {
  it("opens with the decision and marks the step to record next", () => {
    const rows = repairTimeline({
      status: "APPROVED",
      decision: "REPAIR",
      repairSteps: [step("ACCEPTED")],
    });

    expect(rows.map((row) => row.title)).toEqual([
      d.repairStepDecision,
      d.repairStepACCEPTED,
      d.repairStepSENT_TO_SERVICE,
      d.repairStepRETURNED_FROM_SERVICE,
      d.repairStepHANDED_TO_CUSTOMER,
    ]);
    expect(rows.map((row) => row.state)).toEqual([
      "done",
      "done",
      "next",
      "todo",
      "todo",
    ]);
    expect(rows[1].recorded?.step).toBe("ACCEPTED");
  });

  it("offers no next step on a closed return", () => {
    const rows = repairTimeline({
      status: "REFUNDED",
      decision: "REPAIR",
      repairSteps: [],
    });
    expect(rows.some((row) => row.state === "next")).toBe(false);
  });

  it("tolerates a response without repair steps", () => {
    const rows = repairTimeline({ status: "APPROVED", decision: "REPAIR" });
    expect(rows[1].state).toBe("next");
  });
});
