import { dict } from "@/shared/config";
import {
  ORDER_CONFLICT_CODE,
  isOrderConflict,
  orderConflictMessage,
  orderWriteErrorMessage,
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

  it("names the settled money for ORDER_REVIVE_REFUNDED_PAYMENT and does not demand a reload", () => {
    const error = rejection(409, ORDER_CONFLICT_CODE.REVIVE_REFUNDED_PAYMENT);

    expect(orderConflictMessage(error)).toBe(
      dict.orderStatus.conflict.ORDER_REVIVE_REFUNDED_PAYMENT,
    );
    // Nothing is out of date here: the refusal is about what the order IS, so a
    // reload would show the same order and the same refusal (review of plan 180).
    expect(requiresReload(error)).toBe(false);
    // And it must name the only move that works, not a payment status the
    // operator cannot reach — PAYMENT_TRANSITIONS[REFUNDED] is empty.
    expect(orderConflictMessage(error)).toContain("нове замовлення");
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

  it("does NOT treat a coded 500 as a conflict — the status decides, the code only refines (TASK-622)", () => {
    // Every body carries `error`, so the code alone is no evidence of anything:
    // a 500 must fall back to the generic failure, not «оновіть сторінку».
    const error = rejection(500, ORDER_CONFLICT_CODE.STALE);
    expect(isOrderConflict(error)).toBe(false);
    expect(orderConflictMessage(error)).toBeNull();
    expect(requiresReload(error)).toBe(false);
  });

  it("does not read the exception name Nest puts in every body as a conflict (TASK-622)", () => {
    // The real 403 envelope from HttpExceptionFilter.
    expect(isOrderConflict(rejection(403, "Forbidden"))).toBe(false);
    expect(orderConflictMessage(rejection(403, "Forbidden"))).toBeNull();
    expect(orderConflictMessage(rejection(400, "Bad Request"))).toBeNull();
    expect(
      orderConflictMessage(rejection(500, "Internal Server Error")),
    ).toBeNull();
  });

  it("does not treat a plain 500 as a conflict", () => {
    expect(isOrderConflict(rejection(500))).toBe(false);
  });
});

describe("orderWriteErrorMessage (TASK-622)", () => {
  it("names the missing grant for a 403 instead of «замовлення змінилося»", () => {
    const message = orderWriteErrorMessage(rejection(403, "Forbidden"));

    expect(message).toBe(dict.orderStatus.forbidden);
    expect(message).not.toBe(dict.orderStatus.conflictUnknown);
    // And a 403 is never a reload case: reloading does not grant the right.
    expect(requiresReload(rejection(403, "Forbidden"))).toBe(false);
  });

  it("passes a 409 through to the conflict sentence", () => {
    expect(
      orderWriteErrorMessage(rejection(409, ORDER_CONFLICT_CODE.STALE)),
    ).toBe(dict.orderStatus.conflict.ORDER_STALE);
  });

  it("returns null for a 500 and a 400, so the caller shows its generic copy", () => {
    expect(
      orderWriteErrorMessage(rejection(500, "Internal Server Error")),
    ).toBeNull();
    expect(orderWriteErrorMessage(rejection(400, "Bad Request"))).toBeNull();
    expect(orderWriteErrorMessage({})).toBeNull();
  });
});
