"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/ui";
import { cn } from "@/shared/lib";
import { dict } from "@/shared/config";
import type {
  CatalogImportPlan,
  ParseIssue,
  PlannedRow,
} from "../model/plan-types";
import type { useImportDecisions } from "../model/use-import-decisions";

const d = dict.catalogImport;

/** How many rows of a long list are rendered before «Показати ще». */
const PAGE = 25;

type Decisions = ReturnType<typeof useImportDecisions>;

interface ImportPlanReviewProps {
  plan: CatalogImportPlan;
  decisions: Decisions;
}

const productHref = (row: PlannedRow) =>
  row.productId ? `/products/${row.productId}` : undefined;

/**
 * The reviewable body of an import plan (TASK-360), cut into tabs (wave 198,
 * CatalogImportProposal ІК4–ІК7): summary tiles — the risky ones amber — then
 * «Зміни · Зникли з файлу · Нові · Попередження · Пропущені рядки · Довідники»
 * instead of one long feed. Every section that existed is still here, and the
 * parser's warnings — collected in `plan.issues` and shown nowhere — got a tab.
 *
 * Only the sections that need a DECISION carry checkboxes: updates (each
 * proposed field change is its own) and the articles that vanished from the
 * file. New products are a table — there is nothing to weigh up about them:
 * they are created hidden and stock-free.
 */
export function ImportPlanReview({ plan, decisions }: ImportPlanReviewProps) {
  const creates = plan.rows.filter((row) => row.action === "create");
  const updates = plan.rows.filter((row) => row.action === "update");
  const missing = plan.rows.filter((row) => row.action === "missing");
  const errors = plan.issues.filter((issue) => issue.level === "error");
  const warnings = plan.issues.filter((issue) => issue.level === "warning");
  const references = referenceGroups(plan);

  const [tab, setTab] = useState(
    updates.length > 0 ? "changes" : missing.length > 0 ? "missing" : "creates",
  );

  const tabs: Array<{ id: string; label: string; count: number }> = [
    { id: "changes", label: d.tabChanges, count: updates.length },
    { id: "missing", label: d.tabMissing, count: missing.length },
    { id: "creates", label: d.tabCreates, count: creates.length },
    { id: "warnings", label: d.tabWarnings, count: warnings.length },
    { id: "skipped", label: d.tabSkipped, count: errors.length },
    {
      id: "references",
      label: d.tabReferences,
      count: references.filter((group) => group.items.length > 0).length,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <SummaryTiles plan={plan} />

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList
          aria-label={d.tabsAria}
          className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-transparent p-0"
        >
          {tabs.map((item) => (
            <TabsTrigger
              key={item.id}
              value={item.id}
              className="-mb-px min-h-11 flex-none rounded-none border-0 border-b-2 border-transparent px-3 text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none md:min-h-10"
            >
              {item.label}
              <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">
                {item.count.toLocaleString("uk-UA")}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="changes" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{d.changesHint}</p>
            {plan.counts.conflicts > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => decisions.excludeAllConflicts(updates)}
              >
                {d.uncheckConflicts}
              </Button>
            )}
          </div>
          {updates.length === 0 ? (
            <Empty>{d.changesEmpty}</Empty>
          ) : (
            <PagedRows
              rows={updates}
              render={(row) => (
                <UpdateRow
                  key={row.sourceSku}
                  row={row}
                  decisions={decisions}
                />
              )}
            />
          )}
        </TabsContent>

        <TabsContent value="missing" className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{d.missingHint}</p>
          {missing.length === 0 ? (
            <Empty>{d.missingEmpty}</Empty>
          ) : (
            <PagedRows
              rows={missing}
              render={(row) => (
                <div
                  key={row.sourceSku}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card p-3 text-sm"
                >
                  <label className="flex min-w-0 flex-1 items-center gap-3">
                    <Checkbox
                      checked={!decisions.isRowExcluded(row.sourceSku)}
                      onCheckedChange={() => decisions.toggleRow(row.sourceSku)}
                    />
                    <span className="font-medium text-foreground">
                      {row.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {row.sourceSku}
                    </span>
                  </label>
                  <ProductLink row={row} />
                </div>
              )}
            />
          )}
        </TabsContent>

        <TabsContent value="creates" className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{d.createsHint}</p>
          {creates.length === 0 ? (
            <Empty>{d.createsEmpty}</Empty>
          ) : (
            <CreatesTable rows={creates} />
          )}
        </TabsContent>

        <TabsContent value="warnings" className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{d.warningsHint}</p>
          {warnings.length === 0 ? (
            <Empty>{d.warningsEmpty}</Empty>
          ) : (
            <IssueList issues={warnings} tone="warning" />
          )}
        </TabsContent>

        <TabsContent value="skipped" className="flex flex-col gap-3">
          {errors.length === 0 ? (
            <Empty>{d.skippedEmpty}</Empty>
          ) : (
            <IssueList issues={errors} tone="muted" />
          )}
        </TabsContent>

        <TabsContent value="references" className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{d.refHint}</p>
          {references.every((group) => group.items.length === 0) ? (
            <Empty>{d.referencesEmpty}</Empty>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {references
                .filter((group) => group.items.length > 0)
                .map((group) => (
                  <div
                    key={group.label}
                    className="rounded-lg border border-border bg-card p-3"
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
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/** What reference data the run will create along the way. */
function referenceGroups(plan: CatalogImportPlan) {
  return [
    { label: d.refCategories, items: plan.categories.map((c) => c.name) },
    { label: d.refBrands, items: plan.brands.map((b) => b.name) },
    { label: d.refDeviceBrands, items: plan.deviceBrands.map((b) => b.name) },
    { label: d.refDeviceModels, items: plan.deviceModels.map((m) => m.name) },
    {
      label: d.refAttributes,
      items: plan.attributeColumns.map(
        (column) => `${column.label} (${column.filledCount})`,
      ),
    },
    { label: d.refGroups, items: plan.groups.map((g) => g.name) },
  ];
}

/** Headline counters; the two that can cost a hand edit or a row are amber. */
function SummaryTiles({ plan }: { plan: CatalogImportPlan }) {
  const tiles: Array<{ label: string; value: number; risky?: boolean }> = [
    { label: d.tileCreate, value: plan.counts.create },
    { label: d.tileUpdate, value: plan.counts.update },
    { label: d.tileMissing, value: plan.counts.missing },
    { label: d.tileUnchanged, value: plan.counts.unchanged },
    {
      label: d.tileConflicts,
      value: plan.counts.conflicts,
      risky: plan.counts.conflicts > 0,
    },
    {
      label: d.tileErrors,
      value: plan.counts.errors,
      risky: plan.counts.errors > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className={cn(
            "rounded-lg border p-4 shadow-card",
            tile.risky ? "border-warning/40 bg-warning/8" : "bg-card",
          )}
        >
          <p className="font-display text-2xl font-semibold tabular-nums text-foreground">
            {tile.value.toLocaleString("uk-UA")}
          </p>
          <p className="text-xs text-muted-foreground">{tile.label}</p>
        </div>
      ))}
    </div>
  );
}

function ProductLink({ row }: { row: PlannedRow }) {
  const href = productHref(row);
  if (!href) return null;
  return (
    <Link
      href={href}
      className="shrink-0 rounded-xs text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {d.openProduct}
    </Link>
  );
}

/** One updatable product, with a checkbox per proposed field change. */
function UpdateRow({
  row,
  decisions,
}: {
  row: PlannedRow;
  decisions: Decisions;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-foreground">{row.name}</span>
          <span className="text-xs text-muted-foreground">
            {row.sourceSku} · {d.rowNumber(row.rowNumber)}
          </span>
        </div>
        <ProductLink row={row} />
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
            <span className="min-w-28 font-medium text-foreground">
              {change.label}
            </span>
            {/* Set-valued changes arrive without a `from` — the ledger stores
                hashes, not a copy of the supplier's data. Render just the new
                value rather than an arrow out of nowhere. */}
            {change.from !== undefined && (
              <>
                <span className="text-muted-foreground line-through">
                  {change.from}
                </span>
                <span aria-hidden="true" className="text-muted-foreground">
                  →
                </span>
              </>
            )}
            <span className="text-foreground">{change.to}</span>
            {change.conflict && (
              <Badge
                variant="outline"
                className="border-warning/40 bg-warning/12 text-foreground"
              >
                {d.conflictBadge}
              </Badge>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}

/** New products: the name, the article and the sheet row (ІК6). */
function CreatesTable({ rows }: { rows: PlannedRow[] }) {
  const [shown, setShown] = useState(PAGE);
  const visible = rows.slice(0, shown);
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg border border-border shadow-card">
        <Table aria-label={d.tabCreates}>
          <TableHeader>
            <TableRow>
              <TableHead>{d.colProduct}</TableHead>
              <TableHead>{d.colSku}</TableHead>
              <TableHead className="text-right">{d.colRow}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.sourceSku}>
                <TableCell className="text-foreground">{row.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground tabular-nums">
                  {row.sourceSku}
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {row.rowNumber}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <MoreBar
        shown={visible.length}
        total={rows.length}
        onMore={() => setShown((current) => current + PAGE)}
      />
    </div>
  );
}

/** «1–25 із 1 297» and «Показати ще» while there is more. */
function MoreBar({
  shown,
  total,
  onMore,
}: {
  shown: number;
  total: number;
  onMore: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <span className="tabular-nums">{d.pageRange(1, shown, total)}</span>
      {shown < total ? (
        <Button type="button" variant="outline" onClick={onMore}>
          {d.showMore}
        </Button>
      ) : null}
    </div>
  );
}

/** Parser findings: warnings (amber) or skipped rows. */
function IssueList({
  issues,
  tone,
}: {
  issues: ParseIssue[];
  tone: "warning" | "muted";
}) {
  const [shown, setShown] = useState(PAGE);
  const visible = issues.slice(0, shown);
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {visible.map((issue, index) => (
          <li
            key={`${issue.rowNumber}-${issue.code}-${index}`}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3 text-sm",
              tone === "warning"
                ? "border-warning/40 bg-warning/8"
                : "border-border bg-card",
            )}
          >
            {tone === "warning" ? (
              <TriangleAlertIcon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-warning"
              />
            ) : null}
            <span className="min-w-0 flex-1 text-foreground">
              {issue.message}
              {issue.sourceSku ? (
                <span className="ml-2 text-xs text-muted-foreground">
                  {issue.sourceSku}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {d.rowNumber(issue.rowNumber)}
            </span>
          </li>
        ))}
      </ul>
      <MoreBar
        shown={visible.length}
        total={issues.length}
        onMore={() => setShown((current) => current + PAGE)}
      />
    </div>
  );
}

/** Render a long list a page at a time, so a 1300-row plan stays usable. */
function PagedRows({
  rows,
  render,
}: {
  rows: PlannedRow[];
  render: (row: PlannedRow) => ReactNode;
}) {
  const [shown, setShown] = useState(PAGE);
  const visible = rows.slice(0, shown);
  return (
    <div className="flex flex-col gap-2">
      {visible.map(render)}
      <MoreBar
        shown={visible.length}
        total={rows.length}
        onMore={() => setShown((current) => current + PAGE)}
      />
    </div>
  );
}
