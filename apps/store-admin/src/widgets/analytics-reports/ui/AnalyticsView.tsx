"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { Lock } from "lucide-react";

import { useGetRegistrationsReport } from "@/entities/analytics";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { dict } from "@/shared/config";
import { kyivToday } from "@/shared/lib/format";
import { Callout, Skeleton } from "@/shared/ui";
import { readReportPeriod, reportPeriodToQuery } from "../model/report-period";
import { CatalogueReport } from "./CatalogueReport";
import { FunnelReport } from "./FunnelReport";
import { PeriodBar } from "./PeriodBar";
import { ProductsReport } from "./ProductsReport";
import { RegistrationsReport } from "./RegistrationsReport";
import { SalesReport } from "./SalesReport";

const d = dict.analytics;

/**
 * /analytics (TASK-692, plan 188 D; artboards ДН-8.x) — five reports over ONE
 * period, which lives in the URL so a report can be sent as a link.
 *
 * The bar's label needs the server's reading of the period (the actual days
 * and the comparison range). It is taken from the registrations report: the
 * cheapest of the six, without money, and readable by everyone who may open
 * this page (`analytics:read`) — the sales report would 403 for a manager
 * without `analytics:revenue`. The «Реєстрації» block reads the same query
 * (same key), so it costs no extra request.
 */
export function AnalyticsView() {
  const searchParams = useSearchParams();
  const today = kyivToday();
  const selection = useMemo(
    () => readReportPeriod(searchParams, today),
    [searchParams, today],
  );
  const query = useMemo(() => reportPeriodToQuery(selection), [selection]);
  const registrations = useGetRegistrationsReport(query);
  const { can } = useAuth();
  const canRevenue = can(PERM.analyticsRevenue);

  return (
    <div className="flex flex-col gap-4" data-slot="analytics-view">
      <PeriodBar
        selection={selection}
        period={registrations.data?.data.period}
        periodLoading={registrations.isPending}
      />

      {/* ДН-8.4: without `analytics:revenue` the API cuts every sum; say so
          once, above the reports, instead of leaving gaps unexplained. */}
      {canRevenue ? null : (
        <Callout
          variant="strip"
          icon={
            <Lock
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
          }
        >
          {d.revenueLocked}
        </Callout>
      )}

      {/* Each block owns its request, skeleton and error: one failing report
          never blanks the others. «Продажі» is not rendered at all without
          the right — no card, no request. Unlike ДН-8.7, an empty period
          still shows the funnel and registrations with their own zeros. */}
      {canRevenue ? <SalesReport query={query} enabled={canRevenue} /> : null}
      <CatalogueReport query={query} />
      <ProductsReport query={query} />
      <FunnelReport query={query} />
      <RegistrationsReport query={query} />
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
      <div
        aria-hidden="true"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
      >
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-23 rounded-md" />
        ))}
      </div>
      <Skeleton aria-hidden="true" className="h-50 w-full rounded-lg" />
      <Skeleton aria-hidden="true" className="h-65 w-full rounded-lg" />
    </div>
  );
}
