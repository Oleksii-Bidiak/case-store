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
 * its own counter payload (independent of the heavy dashboard summary) via the
 * same query key the sidebar badges read, so TanStack Query serves both from one
 * cache entry. Six cards since TASK-446: new orders, reviews awaiting
 * moderation, unpaid-in-transit orders, orders stale in PENDING and rating-abuse
 * signals all deep-link into their section; failed mail is an info-only card (no
 * admin destination). Zero-count cards still render (so the owner sees "all
 * clear"), visually de-emphasized.
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
    counts.failedMails === 0 &&
    counts.pendingOver48h === 0 &&
    // TASK-446. A counter that renders but sits outside this check is the worst
    // of both worlds: the widget shows a non-zero number AND tells the owner
    // there is nothing to do — about the one signal they would never have
    // thought to go looking for.
    counts.ratingAbuse === 0 &&
    // TASK-470. The same rule, and it matters more here than anywhere else on
    // this widget: nothing ELSE in the system reacts to an unavailable position.
    // The owner's decision (B-1 §3) is that the buyer hears it from a person, so
    // an «Все під контролем» printed over a non-zero count here would be the
    // only notification there is, denying itself.
    counts.unavailableItems === 0;

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

      {/* Seven cards since TASK-470. The column count moved 3 → 4 with it: at
          three columns the seventh card sat alone on a third row, which is the
          same "reads as an afterthought" problem `lg:grid-cols-5` caused at six.
          Four gives 4 + 3, so no card stands by itself on a wide screen. */}
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
        {/* TASK-251: PENDING orders sitting longer than 48h — a subset of new
            orders, so it deep-links to the same PENDING-filtered list. */}
        <NeedsActionCard
          label={dict.dashboard.needsActionPendingOver48h}
          count={counts.pendingOver48h}
          href="/orders?status=PENDING"
        />
        {/* TASK-446: situations worth OPENING, not reviews to moderate — a
            product that collected a burst of ratings in an hour, an address
            behind a run of 1★. The destination is the reviews screen with no
            status filter, because the rows behind a burst can sit in any of the
            three queues and a `?status=` would hide most of them. */}
        <NeedsActionCard
          label={dict.dashboard.needsActionRatingAbuse}
          count={counts.ratingAbuse}
          href="/reviews"
        />
        {/* TASK-470: orders holding a line that can no longer be supplied. The
            deep link carries the SAME predicate the tile counts
            (`hasUnavailableItems`), not an approximation of it — the mistake
            `pendingOver48h` still makes, where the tile counts one thing and the
            click opens another (see the report). */}
        <NeedsActionCard
          label={dict.dashboard.needsActionUnavailableItems}
          count={counts.unavailableItems}
          href="/orders?hasUnavailableItems=true"
        />
        <NeedsActionCard
          label={dict.dashboard.needsActionFailedMails}
          count={counts.failedMails}
        />
      </div>
    </section>
  );
}
