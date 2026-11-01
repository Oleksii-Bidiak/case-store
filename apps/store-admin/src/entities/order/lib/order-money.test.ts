import { returnPayoutDueKop } from "./order-money";

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
