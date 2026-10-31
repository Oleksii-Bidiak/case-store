import { dict } from "@/shared/config";
import {
  DECISION_REASON_MAX_LENGTH,
  createDecideSchema,
  decideValuesToDto,
  type DecideContext,
  type DecideFormValues,
} from "./decide-schema";

const d = dict.returns;

const FRESH: DecideContext = { currentDecision: null, currentReason: null };

/** The first message on `field`, or undefined when the values pass. */
function issueOn(
  field: keyof DecideFormValues,
  values: DecideFormValues,
  context: DecideContext = FRESH,
) {
  const result = createDecideSchema(context).safeParse(values);
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path[0] === field)?.message;
}

describe("createDecideSchema — the first decision (TASK-1961, TASK-2044)", () => {
  it("asks for a decision before anything else", () => {
    expect(issueOn("decision", { decision: "", reason: "" })).toBe(
      d.decideDecisionRequired,
    );
  });

  it("lets a positive decision through without a reason", () => {
    for (const decision of ["REFUND", "REPLACEMENT", "REPAIR"]) {
      expect(
        createDecideSchema(FRESH).safeParse({ decision, reason: "" }).success,
      ).toBe(true);
    }
  });

  it("requires a reason for a refusal — the customer is owed one (AD-RET-07)", () => {
    expect(issueOn("reason", { decision: "REJECT", reason: "" })).toBe(
      d.decideReasonRequired,
    );
    // Whitespace is not a reason: the API trims it to null.
    expect(issueOn("reason", { decision: "REJECT", reason: "   " })).toBe(
      d.decideReasonRequired,
    );
    expect(
      issueOn("reason", { decision: "REJECT", reason: "Сліди удару" }),
    ).toBeUndefined();
  });

  it("caps the reason at the DTO's limit", () => {
    expect(
      issueOn("reason", {
        decision: "REFUND",
        reason: "п".repeat(DECISION_REASON_MAX_LENGTH),
      }),
    ).toBeUndefined();
    expect(
      issueOn("reason", {
        decision: "REFUND",
        reason: "п".repeat(DECISION_REASON_MAX_LENGTH + 1),
      }),
    ).toBe(d.decideReasonTooLong);
  });
});

describe("createDecideSchema — changing a decision already made (TASK-2044)", () => {
  const REPAIR: DecideContext = {
    currentDecision: "REPAIR",
    currentReason: null,
  };

  it("requires a reason for any change, a positive one included", () => {
    expect(issueOn("reason", { decision: "REFUND", reason: "" }, REPAIR)).toBe(
      d.decideReasonRequired,
    );
    expect(
      issueOn(
        "reason",
        { decision: "REFUND", reason: "Сервіс не підлягає ремонту" },
        REPAIR,
      ),
    ).toBeUndefined();
  });

  it("requires a reason on a legacy decision too — it is still a decision", () => {
    expect(
      issueOn(
        "reason",
        { decision: "REJECT", reason: "" },
        { currentDecision: "REFUND", currentReason: null },
      ),
    ).toBe(d.decideReasonRequired);
  });

  it("refuses the same decision with the same reason — the API would say UNCHANGED", () => {
    expect(
      issueOn(
        "reason",
        { decision: "REJECT", reason: " Сліди удару " },
        { currentDecision: "REJECT", currentReason: "Сліди удару" },
      ),
    ).toBe(d.decideUnchanged);
  });

  it("lets the same decision through with a new reason", () => {
    expect(
      issueOn(
        "reason",
        { decision: "REJECT", reason: "Сліди удару й вологи" },
        { currentDecision: "REJECT", currentReason: "Сліди удару" },
      ),
    ).toBeUndefined();
  });
});

describe("decideValuesToDto", () => {
  it("trims the reason and sends a blank one as null", () => {
    expect(decideValuesToDto({ decision: "REFUND", reason: "  " })).toEqual({
      decision: "REFUND",
      reason: null,
    });
    expect(
      decideValuesToDto({ decision: "REJECT", reason: "  Сліди удару " }),
    ).toEqual({ decision: "REJECT", reason: "Сліди удару" });
  });
});
