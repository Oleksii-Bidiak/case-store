import { dict } from "@/shared/config";
import {
  ORDER_CONFLICT_CODE,
  isOrderConflict,
  orderConflictMessage,
  requiresReload,
} from "./order-conflict";

/** Build the shape an Axios rejection presents to the caller. */
function rejection(status: number, error?: string) {
  return {
    response: {
      status,
      data: error === undefined ? {} : { error, message: "server prose" },
    },
  };
}

describe("orderConflictMessage (TASK-332)", () => {
  it("names the lost update for ORDER_STALE, and tells the operator to reload", () => {
    const error = rejection(409, ORDER_CONFLICT_CODE.STALE);

    expect(orderConflictMessage(error)).toBe(
      dict.orderStatus.conflict.ORDER_STALE,
    );
    // Edge case E-11: the operator's screen is behind the server, and the only
    // safe next move is to look at the current state.
    expect(requiresReload(error)).toBe(true);
  });

  it("explains a forbidden move for ORDER_TRANSITION_INVALID without demanding a reload", () => {
    const error = rejection(409, ORDER_CONFLICT_CODE.TRANSITION_INVALID);

    expect(orderConflictMessage(error)).toBe(
      dict.orderStatus.conflict.ORDER_TRANSITION_INVALID,
    );
    // The picker refetches its own options, so a page reload would be busywork.
    expect(requiresReload(error)).toBe(false);
  });

  it("still produces a conflict sentence for a 409 whose body carries no code", () => {
    const error = rejection(409);

    expect(orderConflictMessage(error)).toBe(dict.orderStatus.conflictUnknown);
    expect(requiresReload(error)).toBe(true);
  });

  it("produces a sentence for an unrecognised code rather than echoing the server", () => {
    const error = rejection(409, "ORDER_SOMETHING_NEW");

    expect(orderConflictMessage(error)).toBe(dict.orderStatus.conflictUnknown);
    // The English prose the backend sent must never reach an operator.
    expect(orderConflictMessage(error)).not.toContain("server prose");
  });

  it("returns null for failures that are not conflicts, so the caller falls back", () => {
    expect(orderConflictMessage(rejection(500))).toBeNull();
    expect(orderConflictMessage(rejection(403))).toBeNull();
    expect(orderConflictMessage(undefined)).toBeNull();
    expect(orderConflictMessage(null)).toBeNull();
    // A network failure has no `response` at all.
    expect(orderConflictMessage({})).toBeNull();
  });

  it("treats a coded body as a conflict even when the status was rewritten in transit", () => {
    // A proxy that mangles the status must not turn a lost update into
    // "unknown error" — the code is the more specific signal of the two.
    expect(isOrderConflict(rejection(500, ORDER_CONFLICT_CODE.STALE))).toBe(
      true,
    );
  });

  it("does not treat a plain 500 as a conflict", () => {
    expect(isOrderConflict(rejection(500))).toBe(false);
  });
});
