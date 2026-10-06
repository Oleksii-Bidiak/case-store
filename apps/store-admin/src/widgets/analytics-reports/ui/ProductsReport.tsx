"use client";

import { useState } from "react";
import Link from "next/link";

import {
  useGetProductsReport,
  type GetProductsReportParams,
  type ProductsReportEntity,
} from "@/entities/analytics";
import { dict } from "@/shared/config";
import {
  formatCurrency,
  formatMonthGenitive,
  kyivToday,
  toKyivDateInput,
} from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui";
import { formatCount } from "../lib/format";
import type { ReportQuery } from "../model/report-period";
import { ReportCard } from "./ReportCard";
import { ReportBodySkeleton, ReportLoadError } from "./report-parts";

const d = dict.analytics;

/** The leaders shown, and the outsiders before «Показати всі». */
const TOP = 5;
/** The API's ceiling for one list (`limit` ≤ 50). */
const MAX_LIMIT = 50;

const LINK =
  "rounded-sm font-medium text-foreground underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

/** Same period (preset and days), whatever the `limit` — see `placeholderData`. */
function samePeriod(key: readonly unknown[] | undefined, query: ReportQuery) {
  const params = key?.[1] as GetProductsReportParams | undefined;
  return (
    params?.preset === query.preset &&
    params?.from === query.from &&
    params?.to === query.to
  );
}

/**
 * «Лідери й аутсайдери» (TASK-692, ДН-8.1/8.4). The top five by revenue — by
 * units for someone without `analytics:revenue`, and the heading says which —
 * beside the published products that sold nothing, the longest-waiting first.
 *
 * Owner's decision: instead of the artboard's «Усі 37 у «Товарах» →» (the
 * product list has no "unsold in a period" filter to land on), «Показати всі»
 * asks the same report for up to 50 rows.
 */
export function ProductsReport({ query }: { query: ReportQuery }) {
  // The expanded limit — local, and dropped when the period changes
  // (forms.md 1a, render-time reset).
  const periodKey = JSON.stringify(query);
  const [limit, setLimit] = useState(TOP);
  const [limitFor, setLimitFor] = useState(periodKey);
  if (limitFor !== periodKey) {
    setLimitFor(periodKey);
    setLimit(TOP);
  }

  const report = useGetProductsReport(
    { ...query, limit },
    {
      query: {
        // Keep the rows on screen while «Показати всі» loads more of the SAME
        // period; a new period starts from the skeleton, never from the old
        // period's rows under the new label.
        placeholderData: (previous, previousQuery) =>
          samePeriod(previousQuery?.queryKey, query) ? previous : undefined,
      },
    },
  );
  const data = report.data?.data;

  return (
    <ReportCard title={d.productsTitle}>
      {report.isError ? (
        <ReportLoadError
          onRetry={() => void report.refetch()}
          isRetrying={report.isFetching}
        />
      ) : !data ? (
        <ReportBodySkeleton height="h-56" />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-4">
          <Leaders data={data} />
          <Outsiders
            data={data}
            expanded={limit > TOP}
            loadingMore={report.isPlaceholderData}
            onShowAll={() =>
              setLimit(Math.min(data.outsiders.total, MAX_LIMIT))
            }
          />
        </div>
      )}
    </ReportCard>
  );
}

const ROW = "flex items-baseline gap-3 border-b py-2 text-sm last:border-b-0";

function Leaders({ data }: { data: ProductsReportEntity }) {
  const leaders = data.leaders.slice(0, TOP);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h4 className="text-sm font-semibold text-foreground">
        {data.rankedBy === "revenue" ? d.leadersByRevenue : d.leadersByUnits}
      </h4>
      {leaders.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{d.nothingSold}</p>
      ) : (
        <ol className="flex flex-col">
          {leaders.map((row, index) => (
            <li key={row.productId} className={ROW}>
              <span className="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">
                {index + 1}
              </span>
              <Link
                href={`/products/${row.productId}`}
                className={cn(LINK, "min-w-0 flex-1")}
              >
                {row.name}
              </Link>
              <span className="shrink-0 tabular-nums">
                {row.revenue
                  ? `${d.pieces(formatCount(row.units.current))} · ${formatCurrency(row.revenue.current)}`
                  : d.pieces(formatCount(row.units.current))}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Outsiders({
  data,
  expanded,
  loadingMore,
  onShowAll,
}: {
  data: ProductsReportEntity;
  expanded: boolean;
  loadingMore: boolean;
  onShowAll: () => void;
}) {
  const { total, rows } = data.outsiders;
  const thisYear = kyivToday().slice(0, 4);
  const since = (createdAt: string) =>
    d.outsiderSince(
      formatMonthGenitive(
        createdAt,
        toKyivDateInput(createdAt).slice(0, 4) !== thisYear,
      ),
    );

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h4 className="text-sm font-semibold text-foreground">
        {d.outsidersTitle(total)}
      </h4>
      {total === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{d.outsidersNone}</p>
      ) : (
        <>
          <ul className="flex flex-col">
            {rows.map((row) => (
              <li key={row.productId} className={ROW}>
                <Link
                  href={`/products/${row.productId}`}
                  className={cn(LINK, "min-w-0 flex-1 font-normal")}
                >
                  {row.name}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {`${d.pieces(formatCount(row.stock))} · ${since(row.createdAt)}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{d.outsidersHint}</p>
          {!expanded && total > rows.length ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 self-start md:min-h-8"
              onClick={onShowAll}
            >
              {d.outsidersShowAll(total)}
            </Button>
          ) : null}
          {expanded && loadingMore ? (
            <p role="status" className="text-xs text-muted-foreground">
              {dict.common.loading}
            </p>
          ) : null}
          {expanded && !loadingMore && total > rows.length ? (
            <p className="text-xs text-muted-foreground">
              {d.outsidersCapped(rows.length, total)}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
