import { ReturnEntityStatus, type ReturnEntity } from "@/entities/return";
import { dict } from "@/shared/config";

const d = dict.returns;

/**
 * Quick views by stage (ReturnsProposal Р1) — presets over the SAME `?status=`
 * param the status select used to write, so a deep link (`?status=RECEIVED`)
 * still lands on its view. «Усі» is "no `?status=`"; its id never reaches the
 * URL.
 */
export const ALL_VIEW = "__all__";

export const RETURN_QUICK_VIEWS: ReadonlyArray<{ id: string; label: string }> =
  [
    { id: ReturnEntityStatus.REQUESTED, label: d.tabNew },
    { id: ReturnEntityStatus.APPROVED, label: d.tabAwaitingGoods },
    { id: ReturnEntityStatus.RECEIVED, label: d.tabRefundDue },
    { id: ReturnEntityStatus.REFUNDED, label: d.tabDone },
    { id: ReturnEntityStatus.REJECTED, label: d.tabRejected },
    { id: ALL_VIEW, label: d.tabAll },
  ];

/** Every status, in lifecycle order — the options of «Фільтри». */
export const RETURN_STATUS_OPTIONS: readonly string[] = [
  ReturnEntityStatus.REQUESTED,
  ReturnEntityStatus.APPROVED,
  ReturnEntityStatus.RECEIVED,
  ReturnEntityStatus.REFUNDED,
  ReturnEntityStatus.REJECTED,
];

/** An unknown deep-linked status matches no view. */
export function activeReturnView(status: string): string {
  const id = status || ALL_VIEW;
  return RETURN_QUICK_VIEWS.some((view) => view.id === id) ? id : "";
}

/** Units coming back — «Шт.» counts pieces, not lines (TASK-1056). */
export function returnUnits(rma: Pick<ReturnEntity, "items">): number {
  return rma.items.reduce((sum, item) => sum + item.quantity, 0);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY_MS));
}

/**
 * The «age» line under the date of an OPEN request (Р1): who is waiting on whom.
 * `tone: "warning"` when the shop owes the next move (a fresh request, money to
 * send back), `"muted"` while the shop waits for the customer's parcel. Closed
 * requests have no age.
 *
 * APPROVED counts from `resolvedAt` — the moment the request was approved,
 * which is when the wait for the parcel began.
 */
export function returnAge(
  rma: Pick<ReturnEntity, "status" | "requestedAt" | "resolvedAt">,
  now: number,
): { label: string; tone: "warning" | "muted" } | null {
  switch (rma.status) {
    case ReturnEntityStatus.REQUESTED:
      return {
        label: d.ageWaiting(daysSince(rma.requestedAt, now)),
        tone: "warning",
      };
    case ReturnEntityStatus.APPROVED:
      return {
        label: d.ageAwaitingGoods(
          daysSince(rma.resolvedAt ?? rma.requestedAt, now),
        ),
        tone: "muted",
      };
    case ReturnEntityStatus.RECEIVED:
      return { label: d.ageRefundDue, tone: "warning" };
    default:
      return null;
  }
}
