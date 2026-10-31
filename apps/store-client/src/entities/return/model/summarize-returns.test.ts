import { dict } from "@/shared/config";
import type { ReturnEntity } from "@/shared/api/generated/models";
import { summarizeReturns, summarizeReturnsByOrder } from "./summarize-returns";

type Status = ReturnEntity["status"];

const row = (status: Status, orderId = "order-1") => ({ status, orderId });

const r = dict.returnRequest;

describe("summarizeReturns (TASK-1962)", () => {
  it("is null for an order without returns", () => {
    expect(summarizeReturns([])).toBeNull();
  });

  it("names a single request by its own status, as before", () => {
    expect(summarizeReturns([row("APPROVED")])).toEqual({
      status: "APPROVED",
      label: r.statusLabels.APPROVED,
      tone: "active",
      several: false,
    });
  });

  it.each([
    ["REQUESTED", "active"],
    ["APPROVED", "active"],
    ["RECEIVED", "active"],
    ["REFUNDED", "done"],
    ["REJECTED", "rejected"],
  ] as const)("gives a single %s request the %s tone", (status, tone) => {
    expect(summarizeReturns([row(status)])?.tone).toBe(tone);
  });

  it("does not let one refusal hide an approved request (SF-ACC-37)", () => {
    // The QA case: a refusal for one unit and an approved, received request
    // for two — the badge said «відмовлено», as if nothing had been approved.
    const summary = summarizeReturns([row("REJECTED"), row("RECEIVED")]);

    expect(summary).toEqual({
      status: "MIXED",
      label: r.summary(
        `1 ${r.summaryBuckets.approved} · 1 ${r.summaryBuckets.rejected}`,
      ),
      tone: "active",
      several: true,
    });
  });

  it("counts approved and received requests together, in lifecycle order", () => {
    const summary = summarizeReturns([
      row("REJECTED"),
      row("APPROVED"),
      row("REFUNDED"),
      row("RECEIVED"),
      row("REQUESTED"),
    ]);

    expect(summary?.label).toBe(
      r.summary(
        [
          `1 ${r.summaryBuckets.pending}`,
          `2 ${r.summaryBuckets.approved}`,
          `1 ${r.summaryBuckets.completed}`,
          `1 ${r.summaryBuckets.rejected}`,
        ].join(" · "),
      ),
    );
  });

  it("reads «Повернення: 2 погоджено · 1 відхилено»", () => {
    expect(
      summarizeReturns([row("APPROVED"), row("RECEIVED"), row("REJECTED")])
        ?.label,
    ).toBe("Повернення: 2 погоджено · 1 відхилено");
  });

  it("is done once nothing is open and something was completed", () => {
    expect(summarizeReturns([row("REFUNDED"), row("REJECTED")])?.tone).toBe(
      "done",
    );
  });

  it("is rejected only when every request was refused", () => {
    const summary = summarizeReturns([row("REJECTED"), row("REJECTED")]);
    expect(summary?.tone).toBe("rejected");
    expect(summary?.label).toBe(r.summary(`2 ${r.summaryBuckets.rejected}`));
  });
});

describe("summarizeReturnsByOrder (TASK-1962)", () => {
  it("summarizes each order from all of its requests", () => {
    const byOrder = summarizeReturnsByOrder([
      row("REQUESTED", "order-1"),
      row("REJECTED", "order-2"),
      row("REFUNDED", "order-1"),
    ]);

    expect([...byOrder.keys()].sort()).toEqual(["order-1", "order-2"]);
    expect(byOrder.get("order-1")?.status).toBe("MIXED");
    expect(byOrder.get("order-2")).toEqual(summarizeReturns([row("REJECTED")]));
    expect(byOrder.has("order-3")).toBe(false);
  });
});
