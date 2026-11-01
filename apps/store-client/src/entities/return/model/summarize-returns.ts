import { dict } from "@/shared/config";
import type { ReturnEntity } from "@/shared/api/generated/models";

/**
 * How the summary should read at a glance — the card maps it onto a badge:
 * `active` while something is still moving, `done` once nothing is open and
 * something was completed, `rejected` only when every request was refused.
 */
export type ReturnsSummaryTone = "active" | "done" | "rejected";

export interface ReturnsSummary {
  /** The request's own status when there is one; `MIXED` for several. */
  status: ReturnEntity["status"] | "MIXED";
  label: string;
  tone: ReturnsSummaryTone;
  /**
   * Several requests — the label then names itself («Повернення: …»), so the
   * card drops the sr-only «Статус заяви на повернення» prefix.
   */
  several: boolean;
}

type Bucket = keyof typeof dict.returnRequest.summaryBuckets;

/**
 * Status → bucket. APPROVED and RECEIVED both read «погоджено»: for the
 * customer the request was granted, and whether the parcel has reached the
 * shop yet is progress on it, not a different answer.
 */
const BUCKET: Record<ReturnEntity["status"], Bucket> = {
  REQUESTED: "pending",
  APPROVED: "approved",
  RECEIVED: "approved",
  REFUNDED: "completed",
  REJECTED: "rejected",
};

/** Lifecycle order of the parts in the label. */
const BUCKET_ORDER: readonly Bucket[] = [
  "pending",
  "approved",
  "completed",
  "rejected",
];

function toneOf(
  statuses: readonly ReturnEntity["status"][],
): ReturnsSummaryTone {
  const buckets = statuses.map((status) => BUCKET[status]);
  if (buckets.some((b) => b === "pending" || b === "approved")) return "active";
  if (buckets.some((b) => b === "completed")) return "done";
  return "rejected";
}

/**
 * One badge for ALL return requests of an order (TASK-1962). One request reads
 * as its status, as it always has; several are counted per bucket —
 * «Повернення: 2 погоджено · 1 відхилено» — so a refusal for one unit never
 * hides another request that was approved (SF-ACC-37). `null` = no returns.
 */
export function summarizeReturns(
  returns: readonly Pick<ReturnEntity, "status">[],
): ReturnsSummary | null {
  if (returns.length === 0) return null;
  const statuses = returns.map((row) => row.status);
  const tone = toneOf(statuses);

  if (statuses.length === 1) {
    const [status] = statuses;
    return {
      status,
      label: dict.returnRequest.statusLabels[status] ?? status,
      tone,
      several: false,
    };
  }

  const counts = new Map<Bucket, number>();
  for (const status of statuses) {
    const bucket = BUCKET[status];
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  const parts = BUCKET_ORDER.filter((bucket) => counts.has(bucket)).map(
    (bucket) =>
      `${counts.get(bucket)} ${dict.returnRequest.summaryBuckets[bucket]}`,
  );

  return {
    status: "MIXED",
    label: dict.returnRequest.summary(parts.join(" · ")),
    tone,
    several: true,
  };
}

/** {@link summarizeReturns} per order, from the caller's flat returns list. */
export function summarizeReturnsByOrder(
  returns: readonly Pick<ReturnEntity, "status" | "orderId">[],
): Map<string, ReturnsSummary> {
  const byOrder = new Map<string, Pick<ReturnEntity, "status">[]>();
  for (const row of returns) {
    const rows = byOrder.get(row.orderId) ?? [];
    rows.push(row);
    byOrder.set(row.orderId, rows);
  }
  const summaries = new Map<string, ReturnsSummary>();
  for (const [orderId, rows] of byOrder) {
    const summary = summarizeReturns(rows);
    if (summary) summaries.set(orderId, summary);
  }
  return summaries;
}
