import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib";
import {
  REFUND_AMOUNT_PATTERN,
  parseRefundAmount,
  toKopiykas,
} from "./refund-amount";
import { refundErrorKind, refundErrorMessage } from "./refund-error";

describe("parseRefundAmount (TASK-371)", () => {
  const MAX = "1299.00";

  it("accepts a part of the attempt, as the decimal string the API wants", () => {
    expect(parseRefundAmount("499", MAX)).toEqual({ ok: true, amount: "499" });
    expect(parseRefundAmount(" 499.5 ", MAX)).toEqual({
      ok: true,
      amount: "499.5",
    });
    // The whole attempt is still ≤ the ceiling.
    expect(parseRefundAmount("1299.00", MAX)).toEqual({
      ok: true,
      amount: "1299.00",
    });
  });

  it("takes a comma the way an operator writes money, and sends a dot", () => {
    expect(parseRefundAmount("499,50", MAX)).toEqual({
      ok: true,
      amount: "499.50",
    });
  });

  it("refuses more than THIS attempt charged, naming the ceiling", () => {
    expect(parseRefundAmount("1299.01", MAX)).toEqual({
      ok: false,
      message: dict.orders.refundAmountTooLarge(formatCurrency(MAX)),
    });
    // The «4990 for 499.0» slip the confirmation step also guards against.
    expect(parseRefundAmount("4990", "499.00").ok).toBe(false);
  });

  it("refuses a zero refund", () => {
    expect(parseRefundAmount("0", MAX)).toEqual({
      ok: false,
      message: dict.orders.refundAmountZero,
    });
    expect(parseRefundAmount("0.00", MAX).ok).toBe(false);
  });

  it("refuses anything that is not a decimal with at most two places", () => {
    for (const raw of ["", "abc", "12.345", "-5", "1e3", "1 000"]) {
      expect(parseRefundAmount(raw, MAX)).toEqual({
        ok: false,
        message: dict.orders.refundAmountInvalid,
      });
    }
  });

  it("mirrors the server's RefundRequestDto regex exactly", () => {
    expect(REFUND_AMOUNT_PATTERN.source).toBe("^\\d+(\\.\\d{1,2})?$");
  });

  it("compares in whole kopiykas, so a float never flips the ceiling", () => {
    expect(toKopiykas("0.1") + toKopiykas("0.2")).toBe(toKopiykas("0.3"));
    expect(toKopiykas("499.10")).toBe(49910);
  });
});

describe("refundErrorMessage — the status decides (TASK-371, TASK-622)", () => {
  const rejection = (status: number) => ({
    response: {
      status,
      data: { statusCode: status, error: "Anything", message: "prose" },
    },
  });

  it.each([
    [403, "forbidden", dict.orders.refundErrorForbidden],
    [409, "conflict", dict.orders.refundErrorConflict],
    [400, "tooLarge", dict.orders.refundErrorTooLarge],
    [404, "notFound", dict.orders.refundErrorNotFound],
    [500, "generic", dict.orders.refundErrorGeneric],
  ])("maps %s to %s", (status, kind, message) => {
    expect(refundErrorKind(rejection(status))).toBe(kind);
    expect(refundErrorMessage(rejection(status))).toBe(message);
  });

  it("treats a failure with no response as generic", () => {
    expect(refundErrorMessage(new Error("network"))).toBe(
      dict.orders.refundErrorGeneric,
    );
  });
});
