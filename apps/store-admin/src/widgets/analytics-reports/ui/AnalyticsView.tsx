"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { useGetRegistrationsReport } from "@/entities/analytics";
import { dict } from "@/shared/config";
import { kyivToday } from "@/shared/lib/format";
import { Skeleton } from "@/shared/ui";
import { readReportPeriod, reportPeriodToQuery } from "../model/report-period";
import { PeriodBar } from "./PeriodBar";

/**
 * /analytics (TASK-692, plan 188 D; artboards ДН-8.x) — five reports over ONE
 * period, which lives in the URL so a report can be sent as a link.
 *
 * The bar's label needs the server's reading of the period (the actual days
 * and the comparison range). It is taken from the registrations report: the
 * cheapest of the six, without money, and readable by everyone who may open
 * this page (`analytics:read`) — the sales report would 403 for a manager
 * without `analytics:revenue`. The registrations block (next step) reads the
 * same query, so it costs no extra request.
 */
export function AnalyticsView() {
  const searchParams = useSearchParams();
  const today = kyivToday();
  const selection = useMemo(
    () => readReportPeriod(searchParams, today),
    [searchParams, today],
  );
  const query = reportPeriodToQuery(selection);
  const registrations = useGetRegistrationsReport(query);

  return (
    <div className="flex flex-col gap-4" data-slot="analytics-view">
      <PeriodBar
        selection={selection}
        period={registrations.data?.data.period}
        periodLoading={registrations.isPending}
      />
      {/* TASK-692, next steps: the five report blocks — «Продажі» (only with
          `analytics:revenue`), «Категорії й бренди», «Лідери й аутсайдери»,
          «Конверсія кошик → покупка», «Реєстрації» — go here as siblings,
          each a `ReportCard` taking `query`. */}
    </div>
  );
}

/**
 * The loading state (ДН-8.8): the bar, the five KPI tiles, the chart, a table.
 * Shapes, not a spinner — the page does not jump when the numbers arrive.
 */
export function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <span role="status" className="sr-only">
        {dict.common.loading}
      </span>
      <Skeleton aria-hidden="true" className="h-14 w-full rounded-lg" />
      <div aria-hidden="true" className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-23 rounded-md" />
        ))}
      </div>
      <Skeleton aria-hidden="true" className="h-50 w-full rounded-lg" />
      <Skeleton aria-hidden="true" className="h-65 w-full rounded-lg" />
    </div>
  );
}
