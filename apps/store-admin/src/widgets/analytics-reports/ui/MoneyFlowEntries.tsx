"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import {
  getMoneyFlowEntries,
  MoneyDirection,
  ReportPreset,
  useGetMoneyFlowEntries,
  useGetMoneyFlowReport,
  type MoneyFlowEntryEntity,
} from "@/entities/analytics";
import { PERM } from "@/entities/permission";
import { PermissionGate } from "@/entities/session";
import { dict } from "@/shared/config";
import { formatDateTime, kyivToday } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import {
  Badge,
  ErrorState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableFilters,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
} from "@/shared/ui";
import { moneyFlowEntriesCsv, type CsvFile } from "../lib/csv";
import {
  MONEY_KINDS,
  enteredOnOtherDay,
  entryActor,
  formatSignedKop,
  moneyKindLabel,
  readMoneyKind,
} from "../lib/money-flow";
import {
  readReportPeriod,
  reportPeriodToQuery,
  type ReportQuery,
} from "../model/report-period";
import { CsvButton } from "./CsvButton";
import { PeriodBar } from "./PeriodBar";

const d = dict.analytics;

/** Rows per page on screen. */
export const MONEY_FLOW_PAGE_SIZE = 50;
/** Rows per request when the CSV pages through everything — the API's cap. */
export const MONEY_FLOW_CSV_PAGE_SIZE = 500;

const HEAD = "h-9 px-2.5 text-pill font-medium text-muted-foreground";
const CELL = "px-2.5 py-2 align-top";
const LINK =
  "rounded-sm font-medium text-foreground underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

const KIND_FILTER = [
  {
    param: "kind",
    label: d.moneyFlowKindFilter,
    allLabel: d.moneyFlowKindAll,
    options: MONEY_KINDS.map((kind) => ({
      value: kind,
      label: moneyKindLabel(kind),
    })),
    className: "w-64",
  },
];

/**
 * The money-flow rights (TASK-2395): `analytics:read` for the section, then
 * `analytics:revenue` AND `payments:read` — the API refuses the ledger without
 * either, so the screen refuses first, with the analytics page's pattern.
 */
export function MoneyFlowGate({ children }: { children: ReactNode }) {
  return (
    <PermissionGate
      permission={PERM.analyticsRead}
      title={d.forbidden}
      hint={d.forbiddenHint}
    >
      <PermissionGate
        permission={PERM.analyticsRevenue}
        title={d.moneyFlowForbidden}
        hint={d.moneyFlowForbiddenHint}
      >
        <PermissionGate
          permission={PERM.paymentsRead}
          title={d.moneyFlowForbidden}
          hint={d.moneyFlowForbiddenHint}
        >
          {children}
        </PermissionGate>
      </PermissionGate>
    </PermissionGate>
  );
}

/** `?page=` as a page number; anything else is page 1. */
function readPage(raw: string | null): number {
  const page = Number(raw);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

/**
 * Every entry of the period (and kind), through the plain generated function
 * — the CSV holds the whole register, not the page on screen.
 *
 * The register is paged over a live ledger: an entry recorded between two
 * requests shifts every later row, so a page repeats or skips one. The file
 * must equal the report to the kopeck, so a drifted read is refused (the
 * button turns the throw into a toast) instead of handed to the accountant.
 */
export async function fetchAllMoneyFlowEntries(
  query: ReportQuery & { kind?: MoneyFlowEntryEntity["kind"] },
): Promise<MoneyFlowEntryEntity[]> {
  const entries: MoneyFlowEntryEntity[] = [];
  let page = 1;
  let totalPages = 1;
  let expected: number | undefined;
  do {
    const response = await getMoneyFlowEntries({
      ...query,
      page,
      limit: MONEY_FLOW_CSV_PAGE_SIZE,
    });
    entries.push(...response.data);
    expected ??= response.meta.total;
    if (response.meta.total !== expected) {
      throw new Error("The ledger changed while the CSV was being read");
    }
    totalPages = response.meta.totalPages;
    page += 1;
  } while (page <= totalPages);
  if (
    entries.length !== expected ||
    new Set(entries.map((entry) => entry.id)).size !== entries.length
  ) {
    throw new Error("The ledger changed while the CSV was being read");
  }
  return entries;
}

/**
 * /analytics/money-flow (TASK-2395) — every receipt and payout of a period,
 * by the Kyiv day the money moved. Period, kind and page live in the URL, so
 * a summary row on /analytics can open «this kind, these days» as a link.
 */
export function MoneyFlowEntriesView() {
  return (
    <MoneyFlowGate>
      <MoneyFlowEntries />
    </MoneyFlowGate>
  );
}

export function MoneyFlowEntries() {
  const searchParams = useSearchParams();
  const today = kyivToday();
  const selection = useMemo(
    () => readReportPeriod(searchParams, today),
    [searchParams, today],
  );
  const query = useMemo(() => reportPeriodToQuery(selection), [selection]);
  const kind = readMoneyKind(searchParams.get("kind"));
  const page = readPage(searchParams.get("page"));

  // The bar's label: the server's reading of the period. Same query (and
  // cache entry) as the «Рух коштів» block on /analytics.
  const report = useGetMoneyFlowReport(query);
  const period = report.data?.data.period;
  const entries = useGetMoneyFlowEntries({
    ...query,
    kind,
    page,
    limit: MONEY_FLOW_PAGE_SIZE,
  });
  const rows = entries.data?.data;
  const totalPages = entries.data?.meta.totalPages ?? 0;

  const build =
    period && !entries.isError
      ? (): Promise<CsvFile> =>
          // The days the server resolved, not the preset: a preset is re-read
          // against "now" on every request, and a page fetched after midnight
          // would come from another window.
          fetchAllMoneyFlowEntries({
            preset: ReportPreset.custom,
            from: period.from,
            to: period.to,
            kind,
          }).then((all) => moneyFlowEntriesCsv(period, all))
      : null;

  return (
    <div className="flex flex-col gap-4" data-slot="money-flow-entries">
      <PeriodBar
        selection={selection}
        period={period}
        periodLoading={report.isPending}
        resetOnChange={["page"]}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <TableFilters filters={KIND_FILTER} values={{ kind }} />
        <CsvButton title={d.moneyFlowEntriesHeading} build={build} />
      </div>

      {entries.isError ? (
        <ErrorState
          variant="card"
          message={d.moneyFlowEntriesError}
          onRetry={() => void entries.refetch()}
          isRetrying={entries.isFetching}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader className="bg-transparent">
              <TableRow className="hover:bg-transparent">
                <TableHead className={HEAD}>{d.moneyFlowColDate}</TableHead>
                <TableHead className={HEAD}>{d.moneyFlowColOrder}</TableHead>
                <TableHead className={HEAD}>{d.moneyFlowColKind}</TableHead>
                <TableHead className={cn(HEAD, "text-right")}>
                  {d.moneyFlowColIn}
                </TableHead>
                <TableHead className={cn(HEAD, "text-right")}>
                  {d.moneyFlowColOut}
                </TableHead>
                <TableHead className={HEAD}>{d.moneyFlowColActor}</TableHead>
                <TableHead className={HEAD}>{d.moneyFlowColReason}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!rows ? (
                <SkeletonRows />
              ) : rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={7}
                    className="px-2.5 py-6 text-center text-sm text-muted-foreground"
                  >
                    {kind
                      ? d.moneyFlowEntriesEmptyKind
                      : d.moneyFlowEntriesEmpty}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((entry) => <EntryRow key={entry.id} entry={entry} />)
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 ? (
        <TablePagination
          page={page}
          totalPages={totalPages}
          pageSize={MONEY_FLOW_PAGE_SIZE}
          hidePageSize
          disabled={entries.isFetching}
        />
      ) : null}
    </div>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, index) => (
        <TableRow
          key={index}
          aria-hidden="true"
          className="hover:bg-transparent"
        >
          <TableCell colSpan={7} className="px-2.5 py-2">
            <Skeleton className="h-6 w-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function EntryRow({ entry }: { entry: MoneyFlowEntryEntity }) {
  const isOut = entry.direction === MoneyDirection.OUT;
  const amount = formatSignedKop(entry.signedKop);
  const entered = enteredOnOtherDay(entry);

  return (
    <TableRow data-testid="money-flow-entry">
      <TableCell className={cn(CELL, "whitespace-nowrap tabular-nums")}>
        <span className="flex flex-col items-start gap-1">
          {formatDateTime(entry.occurredAt)}
          {entered ? (
            <span className="text-xs text-muted-foreground">
              {d.moneyFlowMarkCreated(entered)}
            </span>
          ) : null}
        </span>
      </TableCell>
      <TableCell className={cn(CELL, "whitespace-nowrap")}>
        <Link
          href={`/orders/${entry.orderId}`}
          aria-label={d.moneyFlowOrderAria(entry.orderNumber)}
          className={cn(LINK, "font-mono text-sm")}
        >
          #{entry.orderNumber}
        </Link>
      </TableCell>
      <TableCell className={CELL}>
        <span className="flex flex-col items-start gap-1">
          {moneyKindLabel(entry.kind)}
          {entry.isReversal || entry.requested || entry.legacy ? (
            <span className="flex flex-wrap gap-1">
              {entry.isReversal ? (
                <Badge variant="outline">{d.moneyFlowMarkReversal}</Badge>
              ) : null}
              {entry.requested ? (
                <Badge variant="warning">{d.moneyFlowMarkRequested}</Badge>
              ) : null}
              {entry.legacy ? (
                <Badge variant="secondary">{d.moneyFlowMarkLegacy}</Badge>
              ) : null}
            </span>
          ) : null}
        </span>
      </TableCell>
      <TableCell
        className={cn(CELL, "text-right whitespace-nowrap tabular-nums")}
      >
        {isOut ? null : amount}
      </TableCell>
      <TableCell
        className={cn(CELL, "text-right whitespace-nowrap tabular-nums")}
      >
        {isOut ? amount : null}
      </TableCell>
      <TableCell className={CELL}>{entryActor(entry)}</TableCell>
      <TableCell className={cn(CELL, "max-w-72 text-muted-foreground")}>
        {entry.reason ?? null}
      </TableCell>
    </TableRow>
  );
}
