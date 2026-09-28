"use client";

import {
  historyActorLabel,
  historyChangeLabel,
  historyNoteLabel,
  isRefusedPaymentEvent,
  useAdminOrderControllerGetHistory,
} from "@/entities/order";
import { dict } from "@/shared/config";
import { cn, formatDateTime } from "@/shared/lib";
import { OrderTimelineSkeleton } from "./order-timeline-skeleton";

interface OrderTimelineProps {
  orderId: string;
  /** The order's owner id — used to tell a customer self-action from an admin's. */
  customerUserId: string | null;
}

/**
 * Order status/payment-status change timeline (TASK-251).
 *
 * Self-fetching (independent of the parent order query, like NeedsActionWidget),
 * it renders the oldest-first list returned by the admin history endpoint. Each
 * row shows what changed, who changed it (customer / admin / system), and when.
 *
 * A refused provider event (TASK-621) is set apart in the warning tone: it is
 * the one row that records something that did NOT happen, and reading it as an
 * ordinary move is exactly the mistake the old «Оплачено → Оплачено» invited.
 */
export function OrderTimeline({ orderId, customerUserId }: OrderTimelineProps) {
  const { data, isLoading, isError } =
    useAdminOrderControllerGetHistory(orderId);

  if (isLoading) {
    return <OrderTimelineSkeleton />;
  }

  if (isError || !data) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.orders.timelineLoadError}
      </p>
    );
  }

  const entries = data.data;
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {dict.orders.timelineEmpty}
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {entries.map((entry) => {
        const note = historyNoteLabel(entry);
        const refused = isRefusedPaymentEvent(entry);
        return (
          <li
            key={entry.id}
            data-refused={refused ? "true" : undefined}
            className={cn(
              "flex flex-col gap-1 rounded-md border p-3",
              refused ? "border-warning/40 bg-warning/10" : "border-border",
            )}
          >
            <span className="text-sm font-medium text-foreground">
              {historyChangeLabel(entry)}
            </span>
            {/* TASK-932 / TASK-788: the flag that makes this row not ordinary. */}
            {note && (
              <span className="text-xs font-medium text-warning">{note}</span>
            )}
            <span className="text-xs text-muted-foreground">
              {historyActorLabel(entry.changedBy, customerUserId)} ·{" "}
              {formatDateTime(entry.changedAt)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
