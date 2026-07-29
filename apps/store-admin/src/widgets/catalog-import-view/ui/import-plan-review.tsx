"use client";

import { useState } from "react";
import { AlertTriangle, Pencil } from "lucide-react";
import { Badge, Button, Checkbox, Separator } from "@/shared/ui";
import { dict } from "@/shared/config";
import type { CatalogImportPlan, PlannedRow } from "../model/plan-types";
import type { useImportDecisions } from "../model/use-import-decisions";

/** How many rows of a long list are rendered before "show more". */
const PAGE = 25;

interface ImportPlanReviewProps {
  plan: CatalogImportPlan;
  decisions: ReturnType<typeof useImportDecisions>;
}

/**
 * The reviewable body of an import plan (TASK-360).
 *
 * Only the sections that need a DECISION are listed row by row: updates (each
 * proposed field change is its own checkbox) and the articles that vanished
 * from the file. Creates are shown as a count with a sample, because there is
 * nothing to weigh up about them — they are new, hidden, and stock-free — and
 * rendering 1300 of them would bury the dozen rows that actually matter.
 */
export function ImportPlanReview({ plan, decisions }: ImportPlanReviewProps) {
  const d = dict.catalogImport;
  const creates = plan.rows.filter((row) => row.action === "create");
  const updates = plan.rows.filter((row) => row.action === "update");
  const missing = plan.rows.filter((row) => row.action === "missing");
  const errors = plan.issues.filter((issue) => issue.level === "error");

  return (
    <div className="flex flex-col gap-8">
      <SummaryTiles plan={plan} />
      <ReferenceSummary plan={plan} />

      {updates.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-foreground">
              {d.updatesHeading(updates.length)}
            </h3>
            {plan.counts.conflicts > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => decisions.excludeAllConflicts(updates)}
              >
                {d.uncheckConflicts}
              </Button>
            )}
          </div>
          {plan.counts.conflicts > 0 && (
            <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-destructive"
                aria-hidden="true"
              />
              {d.conflictHint}
            </p>
          )}
          <PagedRows
            rows={updates}
            render={(row) => (
              <UpdateRow key={row.sourceSku} row={row} decisions={decisions} />
            )}
          />
        </section>
      )}

      {missing.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold text-foreground">
            {d.missingHeading(missing.length)}
          </h3>
          <p className="text-sm text-muted-foreground">{d.missingHint}</p>
          <PagedRows
            rows={missing}
            render={(row) => (
              <label
                key={row.sourceSku}
                className="flex items-center gap-3 rounded-md border border-border p-3 text-sm"
              >
                <Checkbox
                  checked={!decisions.isRowExcluded(row.sourceSku)}
                  onCheckedChange={() => decisions.toggleRow(row.sourceSku)}
                />
                <span className="font-medium text-foreground">{row.name}</span>
                <span className="text-muted-foreground">{row.sourceSku}</span>
              </label>
            )}
          />
        </section>
      )}

      {creates.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold text-foreground">
            {d.createsHeading(creates.length)}
          </h3>
          <p className="text-sm text-muted-foreground">{d.createsHint}</p>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {creates.slice(0, 8).map((row) => (
              <li key={row.sourceSku}>
                {row.name} <span className="text-xs">({row.sourceSku})</span>
              </li>
            ))}
            {creates.length > 8 && <li>…</li>}
          </ul>
        </section>
      )}

      {errors.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold text-destructive">
            {d.issuesHeading(errors.length)}
          </h3>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {errors.slice(0, 30).map((issue, index) => (
              <li key={`${issue.rowNumber}-${index}`}>
                <span className="text-xs">{d.rowNumber(issue.rowNumber)}</span>{" "}
                — {issue.message}
              </li>
            ))}
            {errors.length > 30 && <li>…</li>}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Headline counters. */
function SummaryTiles({ plan }: { plan: CatalogImportPlan }) {
  const d = dict.catalogImport;
  const tiles: Array<{ label: string; value: number; tone?: string }> = [
    { label: d.tileCreate, value: plan.counts.create },
    { label: d.tileUpdate, value: plan.counts.update },
    { label: d.tileMissing, value: plan.counts.missing },
    { label: d.tileUnchanged, value: plan.counts.unchanged },
    {
      label: d.tileConflicts,
      value: plan.counts.conflicts,
      tone: plan.counts.conflicts > 0 ? "text-destructive" : undefined,
    },
    {
      label: d.tileErrors,
      value: plan.counts.errors,
      tone: plan.counts.errors > 0 ? "text-destructive" : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-lg border border-border bg-card p-4 shadow-card"
        >
          <p
            className={`font-display text-2xl font-semibold tabular-nums ${tile.tone ?? "text-foreground"}`}
          >
            {tile.value}
          </p>
          <p className="text-xs text-muted-foreground">{tile.label}</p>
        </div>
      ))}
    </div>
  );
}

/** What reference data the run will create along the way. */
function ReferenceSummary({ plan }: { plan: CatalogImportPlan }) {
  const d = dict.catalogImport;
  const groups: Array<{ label: string; items: string[] }> = [
    { label: d.refCategories, items: plan.categories.map((c) => c.name) },
    { label: d.refBrands, items: plan.brands.map((b) => b.name) },
    { label: d.refDeviceBrands, items: plan.deviceBrands.map((b) => b.name) },
    {
      label: d.refDeviceModels,
      items: plan.deviceModels.map((m) => m.name),
    },
    {
      label: d.refAttributes,
      items: plan.attributeColumns.map(
        (column) => `${column.label} (${column.filledCount})`,
      ),
    },
    { label: d.refGroups, items: plan.groups.map((g) => g.name) },
  ];

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold text-foreground">
        {d.referencesHeading}
      </h3>
      <p className="text-sm text-muted-foreground">{d.refHint}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groups
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <div
              key={group.label}
              className="rounded-lg border border-border p-3"
            >
              <p className="mb-1 text-sm font-medium text-foreground">
                {group.label}{" "}
                <span className="tabular-nums text-muted-foreground">
                  ({group.items.length})
                </span>
              </p>
              <p className="line-clamp-3 text-xs text-muted-foreground">
                {group.items.slice(0, 12).join(", ")}
                {group.items.length > 12 ? " …" : ""}
              </p>
            </div>
          ))}
      </div>
    </section>
  );
}

/** One updatable product, with a checkbox per proposed field change. */
function UpdateRow({
  row,
  decisions,
}: {
  row: PlannedRow;
  decisions: ReturnType<typeof useImportDecisions>;
}) {
  const d = dict.catalogImport;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">{row.name}</span>
        <span className="text-xs text-muted-foreground">
          {row.sourceSku} · {d.rowNumber(row.rowNumber)}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {row.changes.map((change) => (
          <label
            key={change.field}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
            data-testid={`change-${row.sourceSku}-${change.field}`}
          >
            <Checkbox
              checked={!decisions.isFieldExcluded(row.sourceSku, change.field)}
              onCheckedChange={() =>
                decisions.toggleField(row.sourceSku, change.field)
              }
            />
            <span className="min-w-32 font-medium text-foreground">
              {change.label}
            </span>
            <span className="text-muted-foreground line-through">
              {change.from}
            </span>
            <span aria-hidden="true" className="text-muted-foreground">
              →
            </span>
            <span className="text-foreground">{change.to}</span>
            {change.conflict && (
              <Badge variant="secondary" className="gap-1">
                <Pencil className="size-3" aria-hidden="true" />
                {d.conflictBadge}
              </Badge>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}

/** Render a long list a page at a time, so a 1300-row plan stays usable. */
function PagedRows({
  rows,
  render,
}: {
  rows: PlannedRow[];
  render: (row: PlannedRow) => React.ReactNode;
}) {
  const [shown, setShown] = useState(PAGE);
  const visible = rows.slice(0, shown);
  const remaining = rows.length - visible.length;

  return (
    <div className="flex flex-col gap-2">
      {visible.map(render)}
      {remaining > 0 && (
        <>
          <Separator />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setShown((current) => current + PAGE)}
          >
            {dict.catalogImport.showMore(Math.min(remaining, PAGE))}
          </Button>
        </>
      )}
    </div>
  );
}
