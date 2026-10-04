import type { AuditEntry } from "@/entities/audit";
import { dict } from "@/shared/config";
import {
  auditChanges,
  auditChangesLine,
  auditSentence,
  auditValue,
} from "./audit-sentence";
import { dayGroup, periodLabel, presetOf, shiftDay } from "./audit-filters";

const d = dict.auditLog;

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: "1",
    actorId: "u",
    actorEmail: "a@b.c",
    actorRole: "MANAGER",
    action: "order.updateStatus",
    entityType: "order",
    entityId: "7c1e4b2a-0000-4000-8000-000000000001",
    summary: null,
    diff: null,
    createdAt: "2026-09-25T11:32:00.000Z",
    ...overrides,
  };
}

describe("auditSentence — «що зроблено + з чим» (TASK-1068)", () => {
  it("reads the verb, the noun and the short number, linking the object", () => {
    expect(auditSentence(entry())).toEqual({
      verb: "Змінено статус",
      raw: false,
      object: {
        text: "замовлення #7C1E4B2A",
        href: "/orders/7c1e4b2a-0000-4000-8000-000000000001",
      },
    });
  });

  it("names but does not link a type the panel has no page for", () => {
    expect(
      auditSentence(entry({ action: "payment.refund", entityType: "payment" }))
        .object,
    ).toEqual({ text: `${d.entityNouns.payment} #7C1E4B2A` });
  });

  it("gives a settings singleton no «#00000000» number", () => {
    const sentence = auditSentence(
      entry({
        action: "siteContact.update",
        entityType: "siteContact",
        entityId: "00000000-0000-0000-0000-000000000001",
      }),
    );
    expect(sentence.object?.text).not.toMatch(/#/);
  });

  it("falls back to the raw key for a verb it cannot name", () => {
    const sentence = auditSentence(
      entry({ action: "warehouse.rebalance", entityType: "warehouse" }),
    );
    expect(sentence.raw).toBe(true);
    expect(sentence.verb).toBe("warehouse.rebalance");
  });
});

describe("auditChanges — «Поле · Було · Стало»", () => {
  it("names fields and values in words, keeping «Було» unknown when unrecorded", () => {
    const changes = auditChanges(
      entry({
        diff: {
          status: { to: "SHIPPED" },
          price: { from: "1599.00", to: "1299.00" },
          expectedUpdatedAt: { to: "2026-09-25T11:00:00.000Z" },
        },
      }),
    );
    expect(changes.map((change) => change.label)).toEqual([
      d.fieldLabels.status,
      d.fieldLabels.price,
    ]);
    expect(changes[0]).toMatchObject({ from: null, to: "Відправлено" });
    expect(changes[1].from).toMatch(/1\s?599\s?₴/);
  });

  it("prints booleans, lists and unknowns plainly", () => {
    expect(auditValue("isActive", false, "product")).toBe(d.valueNo);
    expect(auditValue("permissions", ["a:read", "b:write"], "staff")).toBe(
      "a:read, b:write",
    );
    expect(auditValue("x", null, "product")).toBe("—");
  });

  it("puts at most three changes under the sentence", () => {
    const line = auditChangesLine(
      ["a", "b", "c", "d", "e"].map((field) => ({
        field,
        label: field,
        from: null,
        to: "1",
      })),
    );
    expect(line).toBe(`a → 1 · b → 1 · c → 1 · ${d.moreChanges(2)}`);
  });
});

describe("audit filters — period and day groups", () => {
  it("names a range like the artboard", () => {
    expect(periodLabel("2026-09-23", "2026-09-25")).toBe("23.09 – 25.09.2026");
    expect(periodLabel("2026-09-23", "")).toBe(d.periodSince("23.09.2026"));
  });

  it("recognises its presets", () => {
    const today = "2026-09-25";
    expect(presetOf(shiftDay(today, -6), today, today)).toBe("7d");
    expect(presetOf("2026-09-01", today, today)).toBe("custom");
    expect(presetOf("", "", today)).toBe("");
  });

  it("heads today, yesterday and older days", () => {
    const now = new Date("2026-09-25T12:00:00.000Z").getTime();
    expect(dayGroup("2026-09-25T08:00:00.000Z", now).label).toBe(
      d.dayToday("25.09.2026"),
    );
    expect(dayGroup("2026-09-24T08:00:00.000Z", now).label).toBe(
      d.dayYesterday("24.09.2026"),
    );
    expect(dayGroup("2026-09-23T08:00:00.000Z", now).label).toBe("23.09.2026");
  });
});
