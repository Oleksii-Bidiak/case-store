import { ReturnEntityStatus } from "@/shared/api";
import { RESTOCK_ON_STATUS, allowedReturnTransitions } from "./transitions";

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

  it("lets nothing leave REJECTED or REFUNDED", () => {
    // A refusal was communicated to a customer; rewriting it in place erases
    // that it happened. A successful appeal is a NEW request.
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
