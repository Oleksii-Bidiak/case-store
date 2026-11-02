import { ReturnDecision, ReturnEntityStatus } from "@/shared/api";
import {
  RESTOCK_ON_STATUS,
  allowedReturnTransitions,
  availableDecisions,
  nextResolveStep,
} from "./transitions";

/**
 * This table is a MIRROR of `order/returns/return-state-machine.ts` — returns
 * have no `allowed-transitions` endpoint, so the client cannot ask. Every row is
 * spelled out here so that a change on the server which is not copied across
 * shows up as a named failing test rather than as an operator picking a status
 * and being refused.
 */
describe("allowedReturnTransitions — mirror of the backend table (TASK-340)", () => {
  it("offers approve or reject on a fresh request", () => {
    expect(allowedReturnTransitions(ReturnEntityStatus.REQUESTED)).toEqual([
      ReturnEntityStatus.APPROVED,
      ReturnEntityStatus.REJECTED,
    ]);
  });

  it("still allows a refusal after approval — goods can come back damaged", () => {
    expect(allowedReturnTransitions(ReturnEntityStatus.APPROVED)).toEqual([
      ReturnEntityStatus.RECEIVED,
      ReturnEntityStatus.REJECTED,
    ]);
  });

  it("only allows the refund once the goods are physically back", () => {
    expect(allowedReturnTransitions(ReturnEntityStatus.RECEIVED)).toEqual([
      ReturnEntityStatus.REFUNDED,
    ]);
  });

  it("lets no status step leave REJECTED or REFUNDED", () => {
    // Re-opening a refusal is a DECISION (TASK-2044), recorded with a reason
    // and an author — never a bare status write. See `availableDecisions`.
    expect(allowedReturnTransitions(ReturnEntityStatus.REJECTED)).toEqual([]);
    expect(allowedReturnTransitions(ReturnEntityStatus.REFUNDED)).toEqual([]);
  });

  it("returns an empty list for an unknown status instead of throwing", () => {
    expect(allowedReturnTransitions("NOT_A_STATUS")).toEqual([]);
  });

  it("does not hand the caller a reference into the frozen table", () => {
    const first = allowedReturnTransitions(ReturnEntityStatus.REQUESTED);
    first.push(ReturnEntityStatus.REFUNDED);

    expect(allowedReturnTransitions(ReturnEntityStatus.REQUESTED)).toEqual([
      ReturnEntityStatus.APPROVED,
      ReturnEntityStatus.REJECTED,
    ]);
  });

  it("credits stock at RECEIVED, not at REFUNDED", () => {
    // Stock is about where the item is; money is about who holds it. A shop that
    // waits for the refund to restock has sellable inventory invisible in a box.
    expect(RESTOCK_ON_STATUS).toBe(ReturnEntityStatus.RECEIVED);
  });
});

/**
 * TASK-2044 (B-12 §1.1) — APPROVED and REJECTED are set only by a decision
 * (`POST /admin/returns/:id/decision`); the PATCH keeps RECEIVED and REFUNDED.
 * Mirrors `returnStatusAfterDecision` and `decisionPermitsTransition` in
 * `order/returns/return-state-machine.ts`.
 */
describe("availableDecisions — what the decide form may offer (TASK-2044)", () => {
  const ALL = [
    ReturnDecision.REFUND,
    ReturnDecision.REPLACEMENT,
    ReturnDecision.REPAIR,
    ReturnDecision.REJECT,
  ];

  it("offers all four on a fresh, an approved and a refused request", () => {
    // A refusal is re-opened by a positive decision with a reason.
    for (const status of [
      ReturnEntityStatus.REQUESTED,
      ReturnEntityStatus.APPROVED,
      ReturnEntityStatus.REJECTED,
    ]) {
      expect(availableDecisions(status)).toEqual(ALL);
    }
  });

  it("refuses a refusal once the goods are back — RECEIVED cannot become REJECTED", () => {
    expect(availableDecisions(ReturnEntityStatus.RECEIVED)).toEqual([
      ReturnDecision.REFUND,
      ReturnDecision.REPLACEMENT,
      ReturnDecision.REPAIR,
    ]);
  });

  it("offers nothing once the money went back — the decision is locked", () => {
    expect(availableDecisions(ReturnEntityStatus.REFUNDED)).toEqual([]);
    expect(availableDecisions("NOT_A_STATUS")).toEqual([]);
  });
});

describe("nextResolveStep — the one PATCH step the card offers (TASK-2044, R2)", () => {
  it("is «Товар отримано» on an approved return", () => {
    expect(nextResolveStep(ReturnEntityStatus.APPROVED)).toBe(
      ReturnEntityStatus.RECEIVED,
    );
  });

  it("offers no «Гроші повернуто» on received goods — REFUNDED follows from the payouts (TASK-2046)", () => {
    expect(nextResolveStep(ReturnEntityStatus.RECEIVED)).toBeNull();
  });

  it("is never APPROVED, REJECTED or REFUNDED", () => {
    for (const status of [
      ReturnEntityStatus.REQUESTED,
      ReturnEntityStatus.REJECTED,
      ReturnEntityStatus.REFUNDED,
    ]) {
      expect(nextResolveStep(status)).toBeNull();
    }
  });
});
