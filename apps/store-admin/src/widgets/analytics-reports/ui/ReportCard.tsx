import { useId, type ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

export interface ReportCardProps {
  title: string;
  /** One line under the title — what the numbers count and how. */
  subtitle?: ReactNode;
  /** Top-right controls: the «Категорії · Бренди» switch, «CSV». */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * ReportCard — the shell of one report on /analytics (TASK-692, `.rp` in the
 * Analytics artboard): a labelled `<section>`, so each report is a landmark a
 * screen reader can jump between, with its title as an `h3` under the page's
 * `h2` «Звіти».
 */
export function ReportCard({
  title,
  subtitle,
  actions,
  children,
  className,
}: ReportCardProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      data-slot="report-card"
      className={cn(
        "flex min-w-0 flex-col gap-3.5 rounded-lg border bg-card p-4 text-card-foreground",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3
            id={titleId}
            className="font-display text-lg font-semibold text-foreground"
          >
            {title}
          </h3>
          {subtitle ? (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}
