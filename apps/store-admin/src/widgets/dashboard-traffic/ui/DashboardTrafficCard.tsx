"use client";

import { useGetTrafficSummary } from "@/entities/analytics";
import { dict, UMAMI_DASHBOARD_URL } from "@/shared/config";

const d = dict.dashboard;

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
      <h3 className="text-sm font-medium text-muted-foreground">
        {d.trafficHeading}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">{d.trafficSubtext}</p>

      {isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">{d.trafficLoading}</p>
      ) : summary?.configured && summary.available ? (
        <>
          <p className="mt-3 text-xs text-muted-foreground">{d.trafficRange}</p>
          <dl className="mt-2 grid grid-cols-2 gap-4">
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
