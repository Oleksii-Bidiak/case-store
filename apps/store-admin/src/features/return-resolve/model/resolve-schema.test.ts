import { dict } from "@/shared/config";
import {
  OPERATOR_NOTES_MAX_LENGTH,
  notesOnlyDto,
  resolveReturnSchema,
  resolveValuesToDto,
  type ResolveReturnFormValues,
} from "./resolve-schema";

const t = dict.returns;

function values(
  overrides: Partial<ResolveReturnFormValues> = {},
): ResolveReturnFormValues {
  return {
    status: "RECEIVED",
    operatorNotes: "",
    restock: false,
    ...overrides,
  };
}

describe("resolveReturnSchema — the PATCH's own status (TASK-2044, R2 TASK-2046)", () => {
  const passes = (status: string) =>
    resolveReturnSchema.safeParse(values({ status })).success;

  it("takes «Товар отримано», the one step the PATCH still owns", () => {
    expect(passes("RECEIVED")).toBe(true);
  });

  it("never carries APPROVED, REJECTED or REFUNDED", () => {
    // APPROVED / REJECTED are decisions (RETURN_USE_DECISION_ENDPOINT);
    // REFUNDED follows from the payouts on the ledger (RETURN_REFUND_DERIVED).
    expect(passes("APPROVED")).toBe(false);
    expect(passes("REJECTED")).toBe(false);
    expect(passes("REFUNDED")).toBe(false);
    expect(passes("REQUESTED")).toBe(false);
    expect(passes("")).toBe(false);
  });

  it("maps to a body with no amount — money is a ledger entry now", () => {
    const dto = resolveValuesToDto(values({ restock: true }), null);
    expect(dto).toEqual({
      status: "RECEIVED",
      operatorNotes: null,
      restock: true,
    });
    expect(dto).not.toHaveProperty("refundedAmount");
  });
});

describe("resolveReturnSchema — operator notes (TASK-794)", () => {
  const notesIssue = (operatorNotes: string) => {
    const result = resolveReturnSchema.safeParse(values({ operatorNotes }));
    if (result.success) return undefined;
    return result.error.issues.find(
      (issue) => issue.path[0] === "operatorNotes",
    )?.message;
  };

  it("accepts a note at exactly the DTO's limit", () => {
    expect(notesIssue("н".repeat(OPERATOR_NOTES_MAX_LENGTH))).toBeUndefined();
  });

  it("refuses one character more with a sentence the form can show", () => {
    expect(notesIssue("н".repeat(OPERATOR_NOTES_MAX_LENGTH + 1))).toBe(
      t.operatorNotesTooLong,
    );
  });
});

describe("notesOnlyDto — the notes-only PATCH body", () => {
  it("carries the trimmed notes and nothing else — no status or restock", () => {
    expect(notesOnlyDto("  Дзвонив  ")).toEqual({ operatorNotes: "Дзвонив" });
  });

  it("clears the notes with null when the field is blank", () => {
    expect(notesOnlyDto("   ")).toEqual({ operatorNotes: null });
  });
});
