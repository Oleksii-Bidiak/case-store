"use client";

import Link from "next/link";

import { useGetTrafficSummary } from "@/entities/analytics";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { dict, UMAMI_DASHBOARD_URL } from "@/shared/config";

const d = dict.dashboard;

/** The reports on the card's own window (TASK-693): seven days, Kyiv. */
const REPORTS_HREF = "/analytics?preset=7d";

interface DashboardTrafficCardProps {
  /** Defaults to the module-level env constant; overridable for tests. */
  dashboardUrl?: string;
}

/** One metric in the card's grid. Renders «—» when the value is unknown. */
function Metric({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums text-foreground">
        {value ?? "—"}
      </dd>
    </div>
  );
}

/**
 * "Відвідуваність" traffic card.
 *
 * TASK-262 shipped this as a bare outbound link — Umami's own UI does charts
 * well, so mirroring them was not worth it. What that missed is that the owner
 * opens the admin panel every day and Umami almost never: "how many people came
 * yesterday" is a glance, not a research session, and sending them to another
 * app with another login for it means they simply do not look.
 *
 * TASK-380 therefore adds the headline numbers, read through our own API (the
 * analytics credential must never reach this bundle), and KEEPS the link for
 * everything deeper.
 *
 * Three states, deliberately distinct:
 * - not configured → the original muted "ask your developer" copy;
 * - configured but unreachable → says so, rather than drawing zeroes;
 * - configured and answering → the numbers.
 */
export function DashboardTrafficCard({
  dashboardUrl = UMAMI_DASHBOARD_URL,
}: DashboardTrafficCardProps) {
  const { data, isLoading } = useGetTrafficSummary();
  // The dashboard renders this card only under `analytics:read` already; the
  // guard stays here too, so the link never outlives a change of that rule.
  const canSeeReports = useAuth().can(PERM.analyticsRead);
  const summary = data?.data;
  const linked = Boolean(dashboardUrl);

  const deltaPercent =
    summary?.visitors != null &&
    summary.previousVisitors != null &&
    summary.previousVisitors > 0
      ? Math.round(
          ((summary.visitors - summary.previousVisitors) /
            summary.previousVisitors) *
            100,
        )
      : null;

  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-card">
      {/* TASK-693 (ДН-8.10): the window is part of the title, in every state —
          the card's «за 7 днів» and the reports' period must never be read as
          one number disagreeing with another. «Детальніше» opens the reports
          on the SAME seven days, so the two screens agree. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-medium text-muted-foreground">
          {d.trafficHeading}{" "}
          <span data-slot="traffic-window" className="font-normal">
            · {d.trafficRange}
          </span>
        </h3>
        {canSeeReports ? (
          <Link
            href={REPORTS_HREF}
            aria-label={d.trafficMoreAria}
            className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {d.trafficMore}
            <span aria-hidden="true">→</span>
          </Link>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{d.trafficSubtext}</p>

      {isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">{d.trafficLoading}</p>
      ) : summary?.configured && summary.available ? (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-4">
            <Metric
              label={d.trafficVisitors}
              value={summary.visitors?.toLocaleString("uk-UA") ?? null}
            />
            <Metric
              label={d.trafficPageviews}
              value={summary.pageviews?.toLocaleString("uk-UA") ?? null}
            />
            <Metric
              label={d.trafficBounceRate}
              value={
                summary.bounceRate != null
                  ? `${Math.round(summary.bounceRate * 100)}%`
                  : null
              }
            />
            <Metric
              label={d.trafficAvgVisit}
              value={
                summary.avgVisitSeconds != null
                  ? d.trafficSeconds(summary.avgVisitSeconds)
                  : null
              }
            />
          </dl>
          {deltaPercent != null && (
            <p className="mt-3 text-xs text-muted-foreground">
              {deltaPercent >= 0
                ? d.trafficDeltaUp(deltaPercent)
                : d.trafficDeltaDown(deltaPercent)}
            </p>
          )}
        </>
      ) : summary?.configured ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {d.trafficUnavailable}
        </p>
      ) : null}

      {linked ? (
        <a
          href={dashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={d.trafficOpenLinkAria}
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-4"
        >
          {d.trafficOpenLink}
          <span aria-hidden="true">→</span>
        </a>
      ) : (
        !summary?.configured &&
        !isLoading && (
          <p className="mt-3 text-sm text-muted-foreground">
            {d.trafficNotConfigured}
          </p>
        )
      )}
    </div>
  );
}
