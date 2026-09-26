"use client";

import Link from "next/link";
import { useAdminDashboardControllerGetNeedsAction } from "@/entities/dashboard";
import { PERM } from "@/entities/permission";
import {
  ReturnEntityStatus,
  useAdminReturnControllerFindAll,
} from "@/entities/return";
import { useAuth } from "@/entities/session";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib";
import { OPERATIONAL_LIST_QUERY } from "@/shared/lib/query-freshness";
import { ratingAbuseHref } from "../model/rating-abuse-href";
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
 * its own counter payload (independent of the heavy dashboard summary) from the
 * analytics-gated needs-action endpoint. The sidebar badges no longer share this
 * cache entry: since TASK-722 they read `meta.total` of the orders / reviews
 * lists under each section's own right, with the same predicates, so the two
 * numbers agree without one depending on the other. Eight cards since TASK-352 (six since
 * TASK-446): new orders, reviews awaiting
 * moderation, unpaid-in-transit orders, orders stale in PENDING and rating-abuse
 * signals all deep-link into their section; failed mail is an info-only card (no
 * admin destination). Zero-count cards still render (so the owner sees "all
 * clear"), visually de-emphasized.
 *
 * TASK-613 (edge case E-22): a ninth tile, «Нові заявки на повернення», for a
 * session with `returns:read`. Its count is NOT on the needs-action payload —
 * that endpoint is analytics-gated, and widening it would hand the returns count
 * to anyone with the dashboard. Like the sidebar badges (TASK-722) it reads
 * `meta.total` of the returns list under the section's own right, one row, with
 * the queue's operational freshness; the deep link carries the same filter.
 * Without the right the request is never made and the tile does not exist.
 */
export function NeedsActionWidget() {
  const { data, isLoading, isError } =
    useAdminDashboardControllerGetNeedsAction();
  const { can } = useAuth();
  const canReadReturns = can(PERM.returnsRead);
  // TASK-601: the rating-abuse card links only for a moderator — its href can
  // carry an IP address (see `ratingAbuseHref`).
  const canModerateReviews = can(PERM.reviewsModerate);
  const { data: returnsData } = useAdminReturnControllerFindAll(
    { status: ReturnEntityStatus.REQUESTED, limit: 1 },
    { query: { ...OPERATIONAL_LIST_QUERY, enabled: canReadReturns } },
  );
  // `undefined` until the list answers — see `nothingToDo`.
  const newReturns = returnsData?.meta?.total;

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
    counts.unavailableItems === 0 &&
    // TASK-352: money held for an order that is not being fulfilled.
    counts.paidAfterCancel === 0 &&
    // TASK-613: only once the count is KNOWN — an «Все під контролем» printed
    // before the returns list answers could sit over a non-zero tile.
    (!canReadReturns || newReturns === 0);

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

      {/* Eight cards since TASK-352 (4 + 4 at four columns); nine with the
          returns tile (TASK-613), which only a `returns:read` session sees. At
          four columns the ninth would sit alone on a third row — the
          "reads as an afterthought" problem TASK-470 moved away from — so nine
          lay out 3 × 3 and eight stay 4 × 2. */}
      <div
        className={cn(
          "mt-4 grid grid-cols-2 gap-4",
          canReadReturns ? "lg:grid-cols-3" : "lg:grid-cols-4",
        )}
      >
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
        {/* TASK-251: PENDING orders sitting longer than 48h. TASK-607: it
            used to open `?status=PENDING` — ALL new orders — so the operator
            saw 3 on the tile and 27 rows after the click. The list has the
            exact predicate (`pendingOverdue`, the same condition as the
            dashboard's `pendingOver48hWhere`), so the click opens what the
            tile counts, like `hasUnavailableItems` below. */}
        <NeedsActionCard
          label={dict.dashboard.needsActionPendingOver48h}
          count={counts.pendingOver48h}
          href="/orders?pendingOverdue=true"
        />
        {/* TASK-446: situations worth OPENING, not reviews to moderate — a
            product that collected a burst of ratings in an hour, an address
            behind a run of 1★. TASK-601: the payload names them, so a single
            situation opens the reviews screen filtered to that product or that
            address, with `status=all` — the rows behind a burst sit in every
            queue. Several situations open the unfiltered screen. A link only for
            `reviews:moderate`: the href can carry an IP, and an analytics-only
            viewer could neither act on the screen nor should copy the address. */}
        <NeedsActionCard
          label={dict.dashboard.needsActionRatingAbuse}
          count={counts.ratingAbuse}
          href={
            canModerateReviews
              ? ratingAbuseHref(counts.ratingAbuseSignals)
              : undefined
          }
        />
        {/* TASK-470: orders holding a line that can no longer be supplied. The
            deep link carries the SAME predicate the tile counts
            (`hasUnavailableItems`), not an approximation of it. */}
        <NeedsActionCard
          label={dict.dashboard.needsActionUnavailableItems}
          count={counts.unavailableItems}
          href="/orders?hasUnavailableItems=true"
        />
        {/* TASK-352 (decision B-11 №3): a late payment on an order the
            reservation TTL already cancelled. Nothing is refunded or revived
            automatically; the deep link carries the same predicate the tile
            counts. */}
        <NeedsActionCard
          label={dict.dashboard.needsActionPaidAfterCancel}
          count={counts.paidAfterCancel}
          href="/orders?paidAfterCancel=true"
        />
        {/* TASK-613: a new return request, counted by the queue's own
            filter and opening the queue on it. */}
        {canReadReturns ? (
          <NeedsActionCard
            label={dict.dashboard.needsActionNewReturns}
            count={newReturns ?? 0}
            href="/returns?status=REQUESTED"
          />
        ) : null}
        <NeedsActionCard
          label={dict.dashboard.needsActionFailedMails}
          count={counts.failedMails}
        />
      </div>
    </section>
  );
}
