"use client";

import Link from "next/link";

import {
  MoneyDirection,
  useGetMoneyFlowReport,
  type MoneyBalanceEntity,
  type MoneyFlowReportEntity,
} from "@/entities/analytics";
import { dict } from "@/shared/config";
import { formatKop } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { moneyFlowCsv } from "../lib/csv";
import { formatCount } from "../lib/format";
import {
  formatSignedKop,
  isEmptyMoneyFlow,
  kindRowsOf,
  moneyFlowEntriesHref,
  moneyKindLabel,
  type SignedKindRow,
} from "../lib/money-flow";
import type {
  ReportPeriodSelection,
  ReportQuery,
} from "../model/report-period";
import { CsvButton } from "./CsvButton";
import { KpiTile } from "./KpiTile";
import { ReportCard } from "./ReportCard";
import { NoticeBox, ReportBodySkeleton, ReportLoadError } from "./report-parts";

const d = dict.analytics;

// The `.ct` table of the catalogue report: figures under a hairline.
const HEAD = "h-9 px-2.5 text-pill font-medium text-muted-foreground";
const CELL = "px-2.5 py-2 tabular-nums";
const LINK =
  "rounded-sm font-medium text-foreground underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

/** Money that went out, from the shop's side: «−18 400 ₴». */
const outgoing = (kop: number) => formatSignedKop(-kop);

export interface MoneyFlowReportProps {
  query: ReportQuery;
  /** The period as the URL holds it — the register links keep it. */
  selection: ReportPeriodSelection;
  /**
   * Belt and braces for `analytics:revenue` + `payments:read`: the parent
   * does not render the block without both, and the query does not run.
   */
  enabled?: boolean;
}

/**
 * «Рух коштів» (TASK-2395) — the order money ledger by the Kyiv day money
 * moved: in · out · net with the change to the previous period, the eight
 * kinds (each a link into the register), and what customers owe / are owed
 * right now, which is a snapshot and says so.
 */
export function MoneyFlowReport({
  query,
  selection,
  enabled = true,
}: MoneyFlowReportProps) {
  const report = useGetMoneyFlowReport(query, { query: { enabled } });
  const data = report.data?.data;

  return (
    <ReportCard
      title={d.moneyFlowTitle}
      subtitle={d.moneyFlowSubtitle}
      actions={
        <>
          <Link
            href={moneyFlowEntriesHref(selection)}
            className={cn(LINK, "text-sm")}
          >
            {d.moneyFlowAllEntries}
          </Link>
          <CsvButton
            title={d.moneyFlowTitle}
            build={data && !report.isError ? () => moneyFlowCsv(data) : null}
          />
        </>
      }
    >
      {report.isError ? (
        <ReportLoadError
          onRetry={() => void report.refetch()}
          isRetrying={report.isFetching}
        />
      ) : !data ? (
        <ReportBodySkeleton tiles={3} height="h-60" />
      ) : (
        <MoneyFlowBody data={data} selection={selection} />
      )}
    </ReportCard>
  );
}

function MoneyFlowBody({
  data,
  selection,
}: {
  data: MoneyFlowReportEntity;
  selection: ReportPeriodSelection;
}) {
  const { totals, balances } = data;
  const empty = isEmptyMoneyFlow(data);
  const requested = totals.requestedOutKop.current;

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile
          label={d.moneyFlowInTile}
          value={formatSignedKop(totals.inKop.current)}
          previous={formatSignedKop(totals.inKop.previous)}
          changePct={totals.inKop.changePct}
        />
        <KpiTile
          label={d.moneyFlowOutTile}
          value={outgoing(totals.outKop.current)}
          previous={outgoing(totals.outKop.previous)}
          changePct={totals.outKop.changePct}
          goodWhen="down"
          note={
            requested > 0 ? d.moneyFlowRequested(outgoing(requested)) : null
          }
        />
        <KpiTile
          label={d.moneyFlowNetTile}
          value={formatSignedKop(totals.netKop.current)}
          previous={formatSignedKop(totals.netKop.previous)}
          changePct={totals.netKop.changePct}
          accent
        />
      </div>

      {empty ? (
        <NoticeBox title={d.moneyFlowEmpty} />
      ) : (
        <KindsTable data={data} selection={selection} />
      )}

      {/* A group, not a region: a landmark inside the report's own section
          would only add noise to the landmark list. */}
      <div
        role="group"
        aria-label={d.moneyFlowNowTitle}
        className="flex flex-col gap-2"
        data-slot="money-flow-now"
      >
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h4 className="text-sm font-semibold text-foreground">
            {d.moneyFlowNowTitle}
          </h4>
          <span className="text-xs text-muted-foreground">
            {d.moneyFlowNowHint}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <BalanceTile
            label={d.moneyFlowDebt}
            balance={balances.debt}
            href="/orders?hasDebt=true"
          />
          <BalanceTile
            label={d.moneyFlowOwed}
            balance={balances.owedToCustomer}
            href="/orders?owedToCustomer=true"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{d.moneyFlowFootnote}</p>
    </>
  );
}

function BalanceTile({
  label,
  balance,
  href,
}: {
  label: string;
  balance: MoneyBalanceEntity;
  href: string;
}) {
  return (
    <Link
      href={href}
      data-slot="money-balance"
      className="flex min-w-0 flex-col gap-1 rounded-md border border-dashed p-3 outline-none transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-display text-base font-semibold tabular-nums text-foreground">
        {d.moneyFlowBalance(balance.orders, formatKop(balance.kop))}
      </span>
    </Link>
  );
}

function KindsTable({
  data,
  selection,
}: {
  data: MoneyFlowReportEntity;
  selection: ReportPeriodSelection;
}) {
  const groups: Array<[string, SignedKindRow[]]> = [
    [d.moneyFlowGroupIn, kindRowsOf(data, MoneyDirection.IN)],
    [d.moneyFlowGroupOut, kindRowsOf(data, MoneyDirection.OUT)],
  ];
  return (
    <Table aria-label={d.moneyFlowKindsAria}>
      <TableHeader className="bg-transparent">
        <TableRow className="hover:bg-transparent">
          <TableHead className={HEAD}>{d.moneyFlowColKind}</TableHead>
          <TableHead className={cn(HEAD, "text-right")}>
            {d.moneyFlowColGross}
          </TableHead>
          <TableHead className={cn(HEAD, "text-right")}>
            {d.moneyFlowColReversed}
          </TableHead>
          <TableHead className={cn(HEAD, "text-right")}>
            {d.moneyFlowColNet}
          </TableHead>
          <TableHead className={cn(HEAD, "text-right")}>
            {d.moneyFlowColCount}
          </TableHead>
        </TableRow>
      </TableHeader>
      {groups.map(([group, rows]) => (
        <TableBody key={group} data-group={group}>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead
              scope="colgroup"
              colSpan={5}
              className="h-8 px-2.5 text-xs font-semibold text-foreground"
            >
              {group}
            </TableHead>
          </TableRow>
          {rows.map((row) => {
            const label = moneyKindLabel(row.kind);
            return (
              <TableRow key={row.kind} data-kind={row.kind}>
                <TableCell className="px-2.5 py-2">
                  <Link
                    href={moneyFlowEntriesHref(selection, row.kind)}
                    aria-label={d.moneyFlowRowLinkAria(label)}
                    className={cn(LINK, "font-normal")}
                  >
                    {label}
                  </Link>
                </TableCell>
                <TableCell className={cn(CELL, "text-right")}>
                  {formatSignedKop(row.grossKop)}
                </TableCell>
                <TableCell
                  className={cn(
                    CELL,
                    "text-right",
                    row.reversedKop === 0 && "text-muted-foreground",
                  )}
                >
                  {formatSignedKop(row.reversedKop)}
                </TableCell>
                <TableCell className={cn(CELL, "text-right font-medium")}>
                  {formatSignedKop(row.netKop)}
                </TableCell>
                <TableCell className={cn(CELL, "text-right")}>
                  {formatCount(row.count)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      ))}
    </Table>
  );
}
