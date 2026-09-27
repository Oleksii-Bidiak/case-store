import { dict } from "@/shared/config";
import {
  PAYMENT_CONFLICT_CODE,
  paymentConflictMessage,
  paymentWriteErrorMessage,
} from "./payment-conflict";

/** The shape an Axios rejection presents, with the envelope `HttpExceptionFilter` writes. */
function rejection(status: number, error?: string) {
  return {
    response: {
      status,
      data:
        error === undefined
          ? {}
          : { statusCode: status, error, message: "server prose" },
    },
  };
}

describe("paymentConflictMessage (TASK-431, TASK-622)", () => {
  it.each([
    [
      PAYMENT_CONFLICT_CODE.TRANSITION_INVALID,
      dict.orderStatus.conflict.ORDER_PAYMENT_TRANSITION_INVALID,
    ],
    [
      PAYMENT_CONFLICT_CODE.REFUND_REQUIRES_CLOSED_ORDER,
      dict.orderStatus.conflict.ORDER_REFUND_REQUIRES_CLOSED_ORDER,
    ],
    [
      PAYMENT_CONFLICT_CODE.CORRECTION_PROVIDER_REFUND,
      dict.orderStatus.conflict.ORDER_PAYMENT_CORRECTION_PROVIDER_REFUND,
    ],
  ])("words the coded 409 %s", (code, sentence) => {
    expect(paymentConflictMessage(rejection(409, code))).toBe(sentence);
  });

  it("still produces a conflict sentence for a 409 with no or an unknown code", () => {
    expect(paymentConflictMessage(rejection(409))).toBe(
      dict.orderStatus.conflictUnknown,
    );
    expect(paymentConflictMessage(rejection(409, "PAYMENT_NEW"))).toBe(
      dict.orderStatus.conflictUnknown,
    );
  });

  it("is NOT a conflict when only the body carries a code — the status decides", () => {
    // Every Nest body has `error`: the exception name for 403/500, even a real
    // payment code if a proxy rewrote the status. None of these is «оновіть».
    expect(paymentConflictMessage(rejection(403, "Forbidden"))).toBeNull();
    expect(
      paymentConflictMessage(rejection(500, "Internal Server Error")),
    ).toBeNull();
    expect(
      paymentConflictMessage(
        rejection(500, PAYMENT_CONFLICT_CODE.TRANSITION_INVALID),
      ),
    ).toBeNull();
    expect(paymentConflictMessage(rejection(400, "Bad Request"))).toBeNull();
  });

  it("returns null without a response at all (network failure)", () => {
    expect(paymentConflictMessage({})).toBeNull();
    expect(paymentConflictMessage(undefined)).toBeNull();
    expect(paymentConflictMessage(null)).toBeNull();
  });
});

describe("paymentWriteErrorMessage (TASK-622)", () => {
  it("names the missing grant for a 403", () => {
    expect(paymentWriteErrorMessage(rejection(403, "Forbidden"))).toBe(
      dict.orderStatus.forbidden,
    );
  });

  it("passes a 409 through and leaves a 500 to the caller's generic copy", () => {
    expect(
      paymentWriteErrorMessage(
        rejection(409, PAYMENT_CONFLICT_CODE.TRANSITION_INVALID),
      ),
    ).toBe(dict.orderStatus.conflict.ORDER_PAYMENT_TRANSITION_INVALID);
    expect(
      paymentWriteErrorMessage(rejection(500, "Internal Server Error")),
    ).toBeNull();
  });
});
