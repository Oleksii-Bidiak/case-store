"use client";

import {
  useGetSalesReport,
  type SalesReportEntity,
} from "@/entities/analytics";
import { dict } from "@/shared/config";
import { formatCurrency, formatDayWithWeekday } from "@/shared/lib/format";
import {
  MINUS,
  formatAxisMoney,
  formatCount,
  formatMoney,
} from "../lib/format";
import { salesCsv } from "../lib/csv";
import type { ReportQuery } from "../model/report-period";
import { CsvButton } from "./CsvButton";
import { DailyBarChart } from "./DailyBarChart";
import { KpiTile } from "./KpiTile";
import { ReportCard } from "./ReportCard";
import {
  ChartTooltipBox,
  NoticeBox,
  ReportBodySkeleton,
  ReportLoadError,
} from "./report-parts";

const d = dict.analytics;

export interface SalesReportProps {
  query: ReportQuery;
  /**
   * Belt and braces for `analytics:revenue`: the parent does not render this
   * block without the right, and the query does not run either (a 403 here
   * would be the API refusing a request the screen should never have made).
   */
  enabled?: boolean;
}

/** «−18 400 ₴» — money that went back reads as money taken away. */
const refundMoney = (value: number) =>
  value > 0 ? `${MINUS}${formatCurrency(value)}` : formatCurrency(value);

/**
 * «Продажі» (TASK-692, artboard ДН-8.1/8.2/8.7) — only for `analytics:revenue`.
 * Five tiles (sales · refunds · net · orders · average order), each with the
 * change to the previous period and «було …»; the net per day as bars, a day
 * of refunds only dipping below zero in destructive; the counting rules in the
 * footnote, because that is where the owner would otherwise decide the
 * numbers are wrong.
 */
export function SalesReport({ query, enabled = true }: SalesReportProps) {
  const report = useGetSalesReport(query, { query: { enabled } });
  const data = report.data?.data;

  return (
    <ReportCard
      title={d.salesTitle}
      actions={
        <CsvButton
          title={d.salesTitle}
          build={data && !report.isError ? () => salesCsv(data) : null}
        />
      }
    >
      {report.isError ? (
        <ReportLoadError
          onRetry={() => void report.refetch()}
          isRetrying={report.isFetching}
        />
      ) : !data ? (
        <ReportBodySkeleton tiles={5} height="h-45" />
      ) : (
        <SalesBody data={data} />
      )}
    </ReportCard>
  );
}

function SalesBody({ data }: { data: SalesReportEntity }) {
  const empty =
    data.sales.current === 0 &&
    data.refunds.current === 0 &&
    data.orders.current === 0;
  const points = data.daily.map((day) => ({ date: day.date, value: day.net }));
  const nets = points.map((point) => point.value);
  const hasNegative = nets.some((value) => value < 0);

  return (
    <>
      {/* Five across only from xl: beside the sidebar at md/lg a tile is too
          narrow for «412 300 ₴» at display size. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiTile
          label={d.salesTile}
          value={formatCurrency(data.sales.current)}
          previous={formatCurrency(data.sales.previous)}
          changePct={data.sales.changePct}
        />
        <KpiTile
          label={d.refundsTile}
          value={refundMoney(data.refunds.current)}
          previous={formatCurrency(data.refunds.previous)}
          changePct={data.refunds.changePct}
          goodWhen="down"
        />
        <KpiTile
          label={d.netTile}
          value={formatMoney(data.net.current)}
          previous={formatMoney(data.net.previous)}
          changePct={data.net.changePct}
          accent
        />
        <KpiTile
          label={d.ordersTile}
          value={formatCount(data.orders.current)}
          previous={formatCount(data.orders.previous)}
          changePct={data.orders.changePct}
        />
        <KpiTile
          label={d.aovTile}
          value={formatMoney(data.averageOrderValue.current)}
          previous={formatMoney(data.averageOrderValue.previous)}
          changePct={data.averageOrderValue.changePct}
        />
      </div>

      {empty ? (
        <NoticeBox title={d.salesEmptyTitle}>{d.salesEmptyText}</NoticeBox>
      ) : (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
            <li className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-xs bg-primary"
              />
              {d.salesLegendNet}
            </li>
            {hasNegative ? (
              <li className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-xs bg-destructive"
                />
                {d.salesLegendNegative}
              </li>
            ) : null}
          </ul>
          <DailyBarChart
            points={points}
            height={180}
            showDays
            formatTick={formatAxisMoney}
            summary={d.salesChartSummary(
              d.rangeDays(points.length),
              formatMoney(Math.min(...nets)),
              formatMoney(Math.max(...nets)),
            )}
            renderTooltip={(index) => {
              const day = data.daily[index];
              if (!day) return null;
              return (
                <ChartTooltipBox
                  title={formatDayWithWeekday(day.date)}
                  rows={[
                    { label: d.salesTile, value: formatCurrency(day.sales) },
                    { label: d.refundsTile, value: refundMoney(day.refunds) },
                    {
                      label: d.netTile,
                      value: formatMoney(day.net),
                      strong: true,
                    },
                  ]}
                />
              );
            }}
          />
        </div>
      )}

      <p className="text-xs text-muted-foreground">{d.salesFootnote}</p>
    </>
  );
}
