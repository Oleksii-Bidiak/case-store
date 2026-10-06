"use client";

import {
  useGetRegistrationsReport,
  type ComparedValueEntity,
  type RegistrationsReportEntity,
} from "@/entities/analytics";
import { dict } from "@/shared/config";
import { formatDayWithWeekday } from "@/shared/lib/format";
import { formatCount } from "../lib/format";
import type { ReportQuery } from "../model/report-period";
import { DailyBarChart } from "./DailyBarChart";
import { DeltaBadge } from "./DeltaBadge";
import { ReportCard } from "./ReportCard";
import {
  ChartTooltipBox,
  ReportBodySkeleton,
  ReportLoadError,
} from "./report-parts";

const d = dict.analytics;

/**
 * «Реєстрації» (TASK-692, ДН-8.1). New customer accounts and how many of them
 * had bought as guests first, with the daily run as small bars — the same
 * chart as «Продажі», one colour.
 *
 * Reads the very query the page reads for the period bar's label (same key),
 * so it costs no request of its own.
 */
export function RegistrationsReport({ query }: { query: ReportQuery }) {
  const report = useGetRegistrationsReport(query);
  const data = report.data?.data;

  return (
    <ReportCard title={d.registrationsTitle}>
      {report.isError ? (
        <ReportLoadError
          onRetry={() => void report.refetch()}
          isRetrying={report.isFetching}
        />
      ) : !data ? (
        <ReportBodySkeleton height="h-28" />
      ) : (
        <RegistrationsBody data={data} />
      )}
    </ReportCard>
  );
}

function Stat({ label, value }: { label: string; value: ComparedValueEntity }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-display text-xl font-bold tabular-nums text-foreground">
          {formatCount(value.current)}
        </span>
        <DeltaBadge changePct={value.changePct} />
        <span className="text-xs text-muted-foreground">
          {d.was(formatCount(value.previous))}
        </span>
      </span>
    </div>
  );
}

function RegistrationsBody({ data }: { data: RegistrationsReportEntity }) {
  const points = data.daily.map((day) => ({
    date: day.date,
    value: day.registrations,
  }));
  const max = Math.max(0, ...points.map((point) => point.value));

  return (
    <>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <Stat label={d.registrationsNew} value={data.registrations} />
        <Stat label={d.registrationsFromGuest} value={data.fromGuest} />
      </div>
      {points.length ? (
        <DailyBarChart
          points={points}
          height={90}
          yTicks={max > 0 ? [0, max] : [0]}
          formatTick={formatCount}
          summary={d.registrationsChartSummary(
            d.rangeDays(points.length),
            data.registrations.current,
            max,
          )}
          renderTooltip={(index) => {
            const day = points[index];
            if (!day) return null;
            return (
              <ChartTooltipBox
                title={formatDayWithWeekday(day.date)}
                rows={[
                  {
                    label: d.registrationsNew,
                    value: formatCount(day.value),
                    strong: true,
                  },
                ]}
              />
            );
          }}
        />
      ) : null}
    </>
  );
}
