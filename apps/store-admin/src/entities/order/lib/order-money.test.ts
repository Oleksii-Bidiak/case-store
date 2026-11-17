import { MoneyEntryKind } from "@/shared/api";
import { dict } from "@/shared/config";
import {
  isReversibleEntry,
  moneyKindLabel,
  returnPayoutDueKop,
} from "./order-money";

/** TASK-2048: the «Залік» pair of «Створити копію». */
describe("offset entries", () => {
  const row = (kind: string) => ({
    kind: kind as MoneyEntryKind,
    reversalOfId: null,
    reversedById: null,
    voidedAt: null,
  });

  it("reads each half of the pair by its own name", () => {
    expect(moneyKindLabel(MoneyEntryKind.OFFSET_TO_ORDER)).toBe(
      dict.orderMoney.kindLabels.OFFSET_TO_ORDER,
    );
    expect(moneyKindLabel(MoneyEntryKind.OFFSET_FROM_ORDER)).toBe(
      dict.orderMoney.kindLabels.OFFSET_FROM_ORDER,
    );
  });

  it("never offers «Сторнувати» on one half — the server refuses it", () => {
    expect(isReversibleEntry(row(MoneyEntryKind.OFFSET_TO_ORDER))).toBe(false);
    expect(isReversibleEntry(row(MoneyEntryKind.OFFSET_FROM_ORDER))).toBe(
      false,
    );
    expect(isReversibleEntry(row(MoneyEntryKind.CASH_REFUND))).toBe(true);
  });
});

/**
 * R2 (TASK-2046): what one return may still pay out — the server's payout
 * ceiling `min(owed on the return, paid − refunded on the order)`.
 */
describe("returnPayoutDueKop", () => {
  it.each([
    // [what, owedKop, paidKop, refundedKop, expected]
    ["owed in full on a paid order", 79900, 239700, 0, 79900],
    ["AD-RET-17: 100 of 799 already paid out", 69900, 239700, 10000, 69900],
    ["capped by what the order still holds", 79900, 50000, 0, 50000],
    ["an unpaid order returns goods, not money", 79900, 0, 0, 0],
    ["everything paid already went back", 79900, 120000, 120000, 0],
    ["nothing owed", 0, 239700, 0, 0],
  ])("%s", (_what, owedKop, paidKop, refundedKop, expected) => {
    expect(returnPayoutDueKop({ owedKop }, { paidKop, refundedKop })).toBe(
      expected,
    );
  });
});
