import {
  moneyFlowEntry,
  moneyFlowReport,
} from "@/shared/test/analytics-report-fixtures";
import {
  enteredOnOtherDay,
  entryShopKop,
  kindRowsOf,
  moneyFlowEntriesHref,
  readMoneyKind,
} from "./money-flow";

/** TASK-2395 — the sign rules the block, the register and both CSVs share. */

describe("money-flow rules", () => {
  it("reads kinds from the shop's side; the nets add up to «Рух нетто»", () => {
    const data = moneyFlowReport();
    const rows = [...kindRowsOf(data, "IN"), ...kindRowsOf(data, "OUT")];
    const cod = rows.find((row) => row.kind === "COD_NOVA_POSHTA");
    const refund = rows.find((row) => row.kind === "LIQPAY_REFUND");

    expect(cod).toMatchObject({ grossKop: 9_000_000, reversedKop: -129_900 });
    expect(refund).toMatchObject({ grossKop: -1_840_000, netKop: -1_840_000 });
    expect(rows.reduce((sum, row) => sum + row.netKop, 0)).toBe(
      data.totals.netKop.current,
    );
    // No «−0» anywhere.
    expect(
      Object.is(rows.find((r) => r.kind === "TRANSFER_REFUND")?.grossKop, -0),
    ).toBe(false);
  });

  it("signs an entry: IN plus, OUT minus, a reversal flipped", () => {
    expect(entryShopKop(moneyFlowEntry({ signedKop: 100 }))).toBe(100);
    expect(entryShopKop(moneyFlowEntry({ signedKop: -100 }))).toBe(-100);
    expect(
      entryShopKop(moneyFlowEntry({ direction: "OUT", signedKop: 100 })),
    ).toBe(-100);
    expect(
      entryShopKop(moneyFlowEntry({ direction: "OUT", signedKop: -100 })),
    ).toBe(100);
  });

  it("marks an entry written on another Kyiv day — by Kyiv, not UTC", () => {
    expect(enteredOnOtherDay(moneyFlowEntry())).toBeNull();
    // 23:30 and 00:30 Kyiv: the same UTC day, two Kyiv days.
    expect(
      enteredOnOtherDay(
        moneyFlowEntry({
          occurredAt: "2026-09-24T20:30:00.000Z",
          createdAt: "2026-09-24T21:30:00.000Z",
        }),
      ),
    ).toBe("25.09");
  });

  it("keeps only real kinds off the URL", () => {
    expect(readMoneyKind("CASH_REFUND")).toBe("CASH_REFUND");
    expect(readMoneyKind("cash_refund")).toBeUndefined();
    expect(readMoneyKind(null)).toBeUndefined();
  });

  it("links the register with the period as /analytics spells it", () => {
    expect(moneyFlowEntriesHref({ preset: "30d", from: "", to: "" })).toBe(
      "/analytics/money-flow",
    );
    expect(
      moneyFlowEntriesHref(
        { preset: "custom", from: "2026-09-01", to: "2026-09-30" },
        "BANK_TRANSFER",
      ),
    ).toBe(
      "/analytics/money-flow?preset=custom&from=2026-09-01&to=2026-09-30&kind=BANK_TRANSFER",
    );
  });
});
