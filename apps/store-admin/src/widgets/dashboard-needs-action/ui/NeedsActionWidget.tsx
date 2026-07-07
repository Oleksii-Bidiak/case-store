"use client";

import Link from "next/link";
import { useAdminDashboardControllerGetNeedsAction } from "@/entities/dashboard";
import { dict } from "@/shared/config";
import { NeedsActionWidgetSkeleton } from "./NeedsActionWidgetSkeleton";

/**
 * A single "needs action" counter card. Count tone carries meaning (design-system
 * §3): amber `warning` when there is something to act on, muted/de-emphasized
 * when the count is zero ("all clear"). Cards with an `href` are `<Link>`s (the
 * one-click deep link into the filtered section); the failed-mail card has no
 * admin destination, so it renders as a plain, non-interactive stat.
 */
function NeedsActionCard({
  label,
  count,
  href,
}: {
  label: string;
  count: number;
  href?: string;
}) {
  const countClass = count > 0 ? "text-warning" : "text-muted-foreground";
  const base = "block rounded-lg border border-border bg-card p-6 shadow-card";

  const body = (
    <>
      <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
      <p
        className={`mt-2 font-display text-3xl font-bold tracking-tight tabular-nums ${countClass}`}
      >
        {count}
      </p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={`${base} outline-none transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
      >
        {body}
      </Link>
    );
  }

  return <div className={base}>{body}</div>;
}

/**
 * «Потребує дії» — the admin dashboard's needs-action widget (TASK-248). Fetches
 * its own four-counter payload (independent of the heavy dashboard summary) via
 * the same query key the sidebar badges read, so TanStack Query serves both from
 * one cache entry. Renders four cards: new orders, reviews awaiting moderation,
 * and unpaid-in-transit orders deep-link into their filtered sections; failed
 * mail is an info-only card (no admin destination). Zero-count cards still render
 * (so the owner sees "all clear"), visually de-emphasized.
 */
export function NeedsActionWidget() {
  const { data, isLoading, isError } =
    useAdminDashboardControllerGetNeedsAction();

  if (isLoading) {
    return <NeedsActionWidgetSkeleton />;
  }

  if (isError || !data) {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        {dict.dashboard.needsActionLoadError}
      </p>
    );
  }

  const counts = data.data;
  const nothingToDo =
    counts.newOrders === 0 &&
    counts.pendingReviews === 0 &&
    counts.unpaidInTransit === 0 &&
    counts.failedMails === 0;

  return (
    <section aria-label={dict.dashboard.needsActionHeading}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-foreground">
          {dict.dashboard.needsActionHeading}
        </h3>
        {nothingToDo ? (
          <p className="text-xs text-muted-foreground">
            {dict.dashboard.needsActionAllClear}
          </p>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <NeedsActionCard
          label={dict.dashboard.needsActionNewOrders}
          count={counts.newOrders}
          href="/orders?status=PENDING"
        />
        <NeedsActionCard
          label={dict.dashboard.needsActionPendingReviews}
          count={counts.pendingReviews}
          href="/reviews?status=pending"
        />
        <NeedsActionCard
          label={dict.dashboard.needsActionUnpaidInTransit}
          count={counts.unpaidInTransit}
          href="/orders?unpaidInTransit=true"
        />
        <NeedsActionCard
          label={dict.dashboard.needsActionFailedMails}
          count={counts.failedMails}
        />
      </div>
    </section>
  );
}
