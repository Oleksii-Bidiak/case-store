import { dict } from "@/shared/config";
import {
  moneyRefusalNeedsRefetch,
  moneyWriteErrorMessage,
  placeMoneyRefusal,
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

/** TASK-1984 Rule 6 — a refusal about one input goes under it, never twice. */
describe("placeMoneyRefusal", () => {
  const withFields = (
    fieldErrors: Array<{ field: string; constraint: string }>,
  ) => ({
    response: {
      status: 400,
      data: { statusCode: 400, message: "Bad Request", fieldErrors },
    },
  });

  it("puts the overpayment reason refusal under the reason, with no banner", () => {
    expect(
      placeMoneyRefusal(
        failure(400, "ORDER_MONEY_OVERPAYMENT_REASON_REQUIRED"),
      ),
    ).toEqual({
      fields: {
        reason: dict.orderMoney.errors.ORDER_MONEY_OVERPAYMENT_REASON_REQUIRED,
      },
      banner: null,
    });
  });

  it("puts a refund above what was paid under the amount", () => {
    const placed = placeMoneyRefusal(
      failure(400, "ORDER_MONEY_REFUND_EXCEEDS_PAID", "only 12345 kop paid"),
    );
    expect(Object.keys(placed.fields)).toEqual(["amount"]);
    expect(placed.banner).toBeNull();
  });

  it("maps a DTO 400 onto the inputs it names", () => {
    expect(
      placeMoneyRefusal(
        withFields([
          { field: "amountKop", constraint: "max" },
          { field: "note", constraint: "maxLength" },
        ]),
      ),
    ).toEqual({
      fields: {
        amount: dict.orderMoney.amountInvalid,
        reason: dict.forms.tooLong,
      },
      banner: null,
    });
  });

  it("keeps the banner for a remainder no input carries", () => {
    const placed = placeMoneyRefusal(
      withFields([
        { field: "reason", constraint: "isNotEmpty" },
        { field: "expectedUpdatedAt", constraint: "isDateString" },
      ]),
    );
    expect(placed.fields).toEqual({ reason: dict.forms.required });
    expect(placed.banner).toBe(dict.orderMoney.errors.generic);
  });

  it("says a refusal about an input the dialog lacks in the banner", () => {
    // The entry correction has a reason and no amount: a reversal that would
    // leave more refunded than paid must not vanish into an unrendered field.
    expect(
      placeMoneyRefusal(failure(409, "ORDER_MONEY_REFUND_EXCEEDS_PAID"), [
        "reason",
      ]),
    ).toEqual({
      fields: {},
      banner: dict.orderMoney.errors.receiptReversalBelowRefunded,
    });
    const dto = placeMoneyRefusal(
      withFields([{ field: "amountKop", constraint: "max" }]),
      ["reason"],
    );
    expect(dto).toEqual({
      fields: {},
      banner: dict.orderMoney.errors.generic,
    });
  });

  it("leaves a field-less refusal to the banner", () => {
    expect(placeMoneyRefusal(failure(409, "ORDER_MONEY_NOTHING_PAID"))).toEqual(
      {
        fields: {},
        banner: dict.orderMoney.errors.ORDER_MONEY_NOTHING_PAID,
      },
    );
  });
});
