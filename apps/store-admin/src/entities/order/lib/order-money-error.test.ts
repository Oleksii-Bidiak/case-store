import { dict } from "@/shared/config";
import {
  moneyRefusalNeedsRefetch,
  moneyWriteErrorMessage,
} from "./order-money-error";

const failure = (status: number, error: string, message = "") => ({
  response: { status, data: { statusCode: status, error, message } },
});

/**
 * R2 pre-merge review: LiqPay gave no readable answer to a refund. The server
 * keeps the REQUESTED entry (the money may have gone), so the operator must be
 * told NOT to retry, and the block must refetch — the order's numbers moved.
 */
describe("PAYMENT_REFUND_OUTCOME_UNKNOWN", () => {
  const unknown = failure(503, "PAYMENT_REFUND_OUTCOME_UNKNOWN");

  it("tells the operator the request stays and not to repeat it", () => {
    expect(moneyWriteErrorMessage(unknown)).toBe(
      dict.orderMoney.errors.PAYMENT_REFUND_OUTCOME_UNKNOWN,
    );
  });

  it("refetches the block, unlike a plain 503", () => {
    expect(moneyRefusalNeedsRefetch(unknown)).toBe(true);
    expect(moneyRefusalNeedsRefetch(failure(503, "Service Unavailable"))).toBe(
      false,
    );
  });
});
