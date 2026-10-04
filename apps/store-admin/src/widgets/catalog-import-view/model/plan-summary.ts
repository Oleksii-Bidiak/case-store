import type { CatalogImportRunEntity } from "@/shared/api";
import { dict } from "@/shared/config";
import type { CatalogImportPlan } from "./plan-types";

/** The slice of the decisions state the counters read. */
export interface DecisionReader {
  isRowExcluded: (sku: string) => boolean;
  isFieldExcluded: (sku: string, field: string) => boolean;
}

export interface PlanSummary {
  /** New products that will be written. */
  creates: number;
  /** Existing products that will be touched. */
  updates: number;
  /** Products gone from the file that will be hidden (ticked). */
  missing: number;
  /**
   * Rows the run will write — counted EXACTLY as the server counts
   * `totalRows` on apply: every row that changes something, minus the rows
   * unticked as a whole. The old counter added the plan's three totals and
   * ignored the unticked rows, so «Застосувати N» promised more than the
   * progress bar then counted (CatalogImportProposal ІК4).
   */
  positions: number;
  /** Changes over a hand edit the operator unticked — kept as they are. */
  keptEdits: number;
  /** Rows the parser refused. */
  skipped: number;
}

export function summarisePlan(
  plan: CatalogImportPlan,
  decisions: DecisionReader,
): PlanSummary {
  let creates = 0;
  let updates = 0;
  let missing = 0;
  let keptEdits = 0;
  for (const row of plan.rows) {
    if (row.action === "unchanged") continue;
    if (decisions.isRowExcluded(row.sourceSku)) continue;
    if (row.action === "create") creates += 1;
    else if (row.action === "missing") missing += 1;
    else if (row.action === "update") {
      updates += 1;
      keptEdits += row.changes.filter(
        (change) =>
          change.conflict &&
          decisions.isFieldExcluded(row.sourceSku, change.field),
      ).length;
    }
  }
  return {
    creates,
    updates,
    missing,
    positions: creates + updates + missing,
    keptEdits,
    skipped: plan.counts.errors,
  };
}

type RunCounts = Pick<
  CatalogImportRunEntity,
  | "status"
  | "createCount"
  | "updateCount"
  | "missingCount"
  | "appliedRows"
  | "totalRows"
>;

/**
 * A run's result in words for the history table (ІК1): what it would do while
 * waiting, what it did once written, where it stopped when it failed.
 */
export function runResultLabel(run: RunCounts): string {
  const d = dict.catalogImport;
  const parts = (
    entries: Array<[number, (n: number) => string]>,
  ): string | null => {
    const words = entries
      .filter(([count]) => count > 0)
      .map(([count, label]) => label(count));
    return words.length > 0 ? words.join(" · ") : null;
  };
  switch (run.status) {
    case "PARSED":
      return (
        parts([
          [run.createCount, d.resultToCreate],
          [run.updateCount, d.resultToUpdate],
          [run.missingCount, d.resultToHide],
        ]) ?? d.resultNoChanges
      );
    case "APPLIED":
      return (
        parts([
          [run.createCount, d.resultCreated],
          [run.updateCount, d.resultUpdated],
          [run.missingCount, d.resultHidden],
        ]) ?? d.resultNoChanges
      );
    case "APPLYING":
      return d.resultWriting(run.appliedRows, run.totalRows);
    case "FAILED":
      return d.resultStopped(run.appliedRows, run.totalRows);
    default:
      return d.resultNothing;
  }
}

/**
 * The failure in the operator's words (ІК13). The raw text stays available
 * under «Технічні деталі» — it is what a developer needs, not what explains
 * the situation.
 */
export function humanImportError(raw: string | null | undefined): string {
  const d = dict.catalogImport;
  if (
    raw &&
    /reach database|database server|ECONNREFUSED|connection (?:terminated|refused|reset)/i.test(
      raw,
    )
  ) {
    return d.failedDb;
  }
  return d.failedGeneric;
}
