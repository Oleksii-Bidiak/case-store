import { dict } from "@/shared/config";
import { formatKop } from "@/shared/lib";
import {
  checkReduceReason,
  checkReducedCredit,
  placeReduceRefusal,
} from "./reduce-credit";

/** TASK-1984 Rule 6 — where a refused reduce is said. */
describe("placeReduceRefusal", () => {
  const coded = (status: number, error: string) => ({
    response: { status, data: { statusCode: status, error, message: "x" } },
  });

  it("puts a moved bound under the amount, keeps the dialog and re-reads the page", () => {
    expect(
      placeReduceRefusal(coded(409, "RETURN_CREDIT_BELOW_PAID_OUT")),
    ).toEqual({
      fields: { amount: dict.returns.refusalCreditBelowPaidOut },
      refetch: true,
      close: false,
      banner: null,
    });
  });

  it("closes on a refusal of the action itself", () => {
    expect(
      placeReduceRefusal(coded(409, "RETURN_CREDIT_NOT_REFUND")),
    ).toMatchObject({
      close: true,
      banner: dict.returns.refusalCreditNotRefund,
    });
  });

  it("maps a DTO 400 onto the inputs", () => {
    expect(
      placeReduceRefusal({
        response: {
          status: 400,
          data: {
            statusCode: 400,
            message: "Bad Request",
            fieldErrors: [{ field: "reason", constraint: "maxLength" }],
          },
        },
      }),
    ).toEqual({
      fields: { reason: dict.forms.tooLong },
      refetch: false,
      close: false,
      banner: null,
    });
  });

  it("keeps the banner for a failure no input carries", () => {
    expect(placeReduceRefusal({ response: { status: 500 } }).banner).toBe(
      r.reduceFailed,
    );
  });
});

const r = dict.returnMoney;
const bounds = { currentKop: 79900, paidOutKop: 10000 };

describe("checkReducedCredit — reduce-only, not below paid out (R2, TASK-2046)", () => {
  it.each([
    ["the current amount itself", "799", 79900],
    ["a lower amount, typed the Ukrainian way", "500,50", 50050],
    ["exactly what was paid out", "100", 10000],
  ])("accepts %s", (_what, raw, kop) => {
    expect(checkReducedCredit(raw, bounds)).toEqual({ ok: true, kop });
  });

  it("refuses more than the current amount — it may only go down", () => {
    expect(checkReducedCredit("799,01", bounds)).toEqual({
      ok: false,
      message: r.reduceAboveCurrent(formatKop(79900)),
    });
  });

  it("refuses less than was already paid out", () => {
    expect(checkReducedCredit("99,99", bounds)).toEqual({
      ok: false,
      message: r.reduceBelowPaidOut(formatKop(10000)),
    });
  });

  it("accepts zero while nothing was paid out", () => {
    expect(
      checkReducedCredit("0", { currentKop: 79900, paidOutKop: 0 }),
    ).toEqual({ ok: true, kop: 0 });
  });

  it("refuses what is not an amount", () => {
    expect(checkReducedCredit("сто", bounds)).toEqual({
      ok: false,
      message: dict.orderMoney.amountInvalid,
    });
  });
});

describe("checkReduceReason", () => {
  it("requires a reason — blank is none", () => {
    expect(checkReduceReason("   ")).toEqual({
      ok: false,
      message: dict.orderMoney.reasonRequired,
    });
    expect(checkReduceReason("  Подряпина на корпусі ")).toEqual({
      ok: true,
      reason: "Подряпина на корпусі",
    });
  });
});
