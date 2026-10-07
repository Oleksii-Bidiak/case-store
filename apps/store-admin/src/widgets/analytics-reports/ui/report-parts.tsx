import type { ReactNode } from "react";

import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { ErrorState, Skeleton } from "@/shared/ui";

const d = dict.analytics;

/**
 * A report that failed to load (TASK-692). The canonical inline error with
 * «Повторити», scoped to the one card: the other reports keep their numbers.
 */
export function ReportLoadError({
  onRetry,
  isRetrying,
}: {
  onRetry: () => void;
  isRetrying: boolean;
}) {
  return (
    <ErrorState
      variant="inline"
      message={d.reportError}
      onRetry={onRetry}
      isRetrying={isRetrying}
    />
  );
}

/**
 * A report's body while it loads — shapes, under the real title, so the card
 * keeps its place and its name while the numbers are on their way.
 */
export function ReportBodySkeleton({
  tiles = 0,
  height = "h-40",
}: {
  /** KPI tiles above the body, as «Продажі» has. */
  tiles?: number;
  /** Height class of the main block. */
  height?: string;
}) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <span role="status" className="sr-only">
        {dict.common.loading}
      </span>
      {tiles ? (
        <div
          aria-hidden="true"
          className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
        >
          {Array.from({ length: tiles }).map((_, index) => (
            <Skeleton key={index} className="h-23 rounded-md" />
          ))}
        </div>
      ) : null}
      <Skeleton
        aria-hidden="true"
        className={cn("w-full rounded-md", height)}
      />
    </div>
  );
}

/**
 * The dashed box a report shows instead of figures it does not have (`.nf`):
 * an empty period, analytics not connected, Umami not answering. Never a «0%»
 * standing in for "unknown".
 */
export function NoticeBox({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      data-slot="report-notice"
      className="flex flex-col items-start gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground"
    >
      <p className="font-medium text-foreground">{title}</p>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

/** The hover/keyboard tooltip of the report charts (`.tip`). */
export function ChartTooltipBox({
  title,
  rows,
}: {
  title: string;
  rows: ReadonlyArray<{ label: string; value: string; strong?: boolean }>;
}) {
  return (
    <div className="flex w-52 flex-col gap-0.5 rounded-md border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-elevated">
      <p className="text-sm font-semibold">{title}</p>
      {rows.map((row) => (
        <p key={row.label} className="flex justify-between gap-2 tabular-nums">
          <span className="text-muted-foreground">{row.label}</span>
          <span className={cn(row.strong && "font-semibold")}>{row.value}</span>
        </p>
      ))}
    </div>
  );
}
