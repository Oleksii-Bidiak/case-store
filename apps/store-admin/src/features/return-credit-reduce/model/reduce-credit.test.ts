import { dict } from "@/shared/config";
import { formatKop } from "@/shared/lib";
import { checkReduceReason, checkReducedCredit } from "./reduce-credit";

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
