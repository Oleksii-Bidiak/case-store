import { dict } from "@/shared/config";
import type { CatalogImportPlan, PlannedRow } from "./plan-types";
import {
  humanImportError,
  runResultLabel,
  summarisePlan,
} from "./plan-summary";

const d = dict.catalogImport;

function row(
  sourceSku: string,
  action: PlannedRow["action"],
  changes: PlannedRow["changes"] = [],
): PlannedRow {
  return {
    sourceSku,
    rowNumber: 2,
    action,
    name: sourceSku,
    productId: action === "create" ? null : `p-${sourceSku}`,
    slug: sourceSku.toLowerCase(),
    changes,
  };
}

const PLAN: CatalogImportPlan = {
  rows: [
    row("N1", "create"),
    row("N2", "create"),
    row("U1", "update", [
      { field: "price", label: "Ціна", from: "299", to: "349", conflict: true },
      { field: "name", label: "Назва", from: "a", to: "b", conflict: false },
    ]),
    row("U2", "update", [
      { field: "price", label: "Ціна", from: "1", to: "2", conflict: false },
    ]),
    row("M1", "missing"),
    row("M2", "missing"),
    row("S1", "unchanged"),
  ],
  categories: [],
  brands: [],
  deviceBrands: [],
  deviceModels: [],
  attributeColumns: [],
  groups: [],
  issues: [],
  counts: {
    total: 7,
    create: 2,
    update: 2,
    unchanged: 1,
    missing: 2,
    conflicts: 1,
    errors: 3,
  },
};

const none = {
  isRowExcluded: () => false,
  isFieldExcluded: () => false,
};

describe("summarisePlan (ІК4)", () => {
  it("counts every changing row, never the unchanged ones", () => {
    expect(summarisePlan(PLAN, none)).toEqual({
      creates: 2,
      updates: 2,
      missing: 2,
      positions: 6,
      keptEdits: 0,
      skipped: 3,
    });
  });

  it("drops a row unticked as a whole — the old counter ignored it", () => {
    const summary = summarisePlan(PLAN, {
      isRowExcluded: (sku) => sku === "M2",
      isFieldExcluded: (sku) => sku === "M2",
    });
    expect(summary.missing).toBe(1);
    expect(summary.positions).toBe(5);
  });

  it("counts an unticked conflicting field as a kept hand edit", () => {
    const summary = summarisePlan(PLAN, {
      isRowExcluded: () => false,
      isFieldExcluded: (sku, field) => sku === "U1" && field === "price",
    });
    expect(summary.keptEdits).toBe(1);
    // The row still counts — the server still walks it.
    expect(summary.positions).toBe(6);
  });
});

describe("runResultLabel (ІК1 history)", () => {
  const base = {
    createCount: 3,
    updateCount: 5,
    missingCount: 4,
    appliedRows: 412,
    totalRows: 1297,
  };

  it("says what a pending run would do", () => {
    expect(runResultLabel({ ...base, status: "PARSED" })).toBe(
      `${d.resultToCreate(3)} · ${d.resultToUpdate(5)} · ${d.resultToHide(4)}`,
    );
  });

  it("drops the zero parts of a written run", () => {
    expect(
      runResultLabel({
        ...base,
        status: "APPLIED",
        createCount: 1297,
        updateCount: 0,
        missingCount: 0,
      }),
    ).toBe(d.resultCreated(1297));
  });

  it("says where a failed run stopped, and that a rejected one wrote nothing", () => {
    expect(runResultLabel({ ...base, status: "FAILED" })).toBe(
      d.resultStopped(412, 1297),
    );
    expect(runResultLabel({ ...base, status: "CANCELLED" })).toBe(
      d.resultNothing,
    );
  });
});

describe("humanImportError (ІК13)", () => {
  it("explains a lost database connection in words", () => {
    expect(
      humanImportError("Can't reach database server at `postgres:5432`"),
    ).toBe(d.failedDb);
  });

  it("falls back to the general explanation", () => {
    expect(humanImportError("TypeError: x is undefined")).toBe(d.failedGeneric);
    expect(humanImportError(null)).toBe(d.failedGeneric);
  });
});
