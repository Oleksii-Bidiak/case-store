"use client";

import { useMemo } from "react";
import type { CatalogImportRunEntity } from "@/shared/api";
import {
  Badge,
  RegistryTable,
  useDataRegistry,
  type RegistryCardParts,
  type RegistryColumn,
} from "@/shared/ui";
import { cn, formatDateTime } from "@/shared/lib";
import { dict } from "@/shared/config";
import { runResultLabel } from "../model/plan-summary";

const d = dict.catalogImport;

/**
 * Width the default-visible columns may share at 1440: content area 1136
 * minus the «⋯» column and the box border — no selection, nothing to bulk.
 */
export const IMPORT_HISTORY_WIDTH_BUDGET = 1136 - 44 - 2;

/**
 * Badge canon §1.6 by run status: waiting amber, written green-tinted, a
 * failure in the error colour (it IS an error), a rejected parse grey.
 */
const STATUS_TONE: Record<string, string> = {
  PARSED: "border-transparent bg-warning/15 text-foreground",
  APPLYING: "",
  APPLIED: "border-transparent bg-success/15 text-foreground",
  FAILED: "border-transparent bg-destructive/12 text-destructive",
  CANCELLED: "border-transparent bg-secondary text-secondary-foreground",
};

export function ImportStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn(STATUS_TONE[status])}>
      {d.status[status] ?? status}
    </Badge>
  );
}

export function buildHistoryColumns(): RegistryColumn<CatalogImportRunEntity>[] {
  return [
    {
      id: "file",
      label: d.colFile,
      locked: true,
      defaultWidth: 300,
      minWidth: 180,
      cell: (run) => (
        <span className="truncate font-medium text-foreground">
          {run.filename}
        </span>
      ),
    },
    {
      id: "status",
      label: d.colStatus,
      defaultWidth: 200,
      minWidth: 140,
      cell: (run) => <ImportStatusBadge status={run.status} />,
    },
    {
      id: "when",
      label: d.colWhen,
      defaultWidth: 170,
      minWidth: 140,
      className: "tabular-nums",
      cell: (run) => formatDateTime(run.createdAt),
    },
    {
      id: "who",
      label: d.colWho,
      defaultWidth: 200,
      minWidth: 120,
      cell: (run) => (
        <span className="truncate text-xs text-muted-foreground">
          {run.actorEmail ?? "—"}
        </span>
      ),
    },
    {
      id: "result",
      label: d.colResult,
      align: "end",
      defaultWidth: 220,
      minWidth: 160,
      cell: (run) => (
        <span className="text-foreground">{runResultLabel(run)}</span>
      ),
    },
  ];
}

function renderHistoryCard(
  run: CatalogImportRunEntity,
  parts: RegistryCardParts,
) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-medium break-all text-foreground">
          {run.filename}
        </span>
        {parts.actions}
      </div>
      <span className="text-xs text-muted-foreground">
        {`${formatDateTime(run.createdAt)} · ${runResultLabel(run)}`}
      </span>
      <ImportStatusBadge status={run.status} />
    </div>
  );
}

const getRowId = (run: CatalogImportRunEntity) => run.id;
const getRowLabel = (run: CatalogImportRunEntity) => run.filename;

/**
 * «Попередні імпорти» as a table (CatalogImportProposal ІК1/ІК3): status by
 * the badge canon, the result in words, cards below md. «⋯ → Відкрити» brings
 * a run back onto the screen — a parse waiting for review, a write in
 * progress (the page may be closed while the worker writes), a finished one.
 * The caller refetches the list after every action.
 */
export function ImportHistory({
  runs,
  isLoading,
  isError,
  onRetry,
  onOpen,
}: {
  runs: readonly CatalogImportRunEntity[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onOpen: (id: string) => void;
}) {
  const columns = useMemo(() => buildHistoryColumns(), []);
  const registry = useDataRegistry({
    tableId: "catalog-import-history",
    columns,
    rows: runs,
    getRowId,
  });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">
          {d.historyHeading}
        </h3>
        <span className="text-xs text-muted-foreground">{d.historyLive}</span>
      </div>
      <RegistryTable
        label={d.historyHeading}
        columns={registry.visibleColumns}
        rows={registry.rows}
        getRowId={getRowId}
        getRowLabel={getRowLabel}
        widths={registry.widths}
        onResize={registry.settings.setWidth}
        density={registry.settings.settings.density}
        rowActions={(run) => [
          { label: d.historyOpen, onSelect: () => onOpen(run.id) },
        ]}
        onRowOpen={(run) => onOpen(run.id)}
        itemForms={d.historyItemForms}
        renderCard={renderHistoryCard}
        isLoading={isLoading}
        isError={isError}
        errorMessage={d.loadError}
        onRetry={onRetry}
        emptyState={d.historyEmpty}
      />
    </section>
  );
}
