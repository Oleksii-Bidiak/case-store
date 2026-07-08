"use client";

import {
  historyActorLabel,
  historyChangeLabel,
  useAdminOrderControllerGetHistory,
} from "@/entities/order";
import { dict } from "@/shared/config";
import { OrderTimelineSkeleton } from "./order-timeline-skeleton";

interface OrderTimelineProps {
  orderId: string;
  /** The order's owner id — used to tell a customer self-action from an admin's. */
  customerUserId: string;
}

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * Order status/payment-status change timeline (TASK-251).
 *
 * Self-fetching (independent of the parent order query, like NeedsActionWidget),
 * it renders the oldest-first list returned by the admin history endpoint. Each
 * row shows what changed, who changed it (customer / admin / system), and when.
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
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex flex-col gap-1 rounded-md border border-border p-3"
        >
          <span className="text-sm font-medium text-foreground">
            {historyChangeLabel(entry)}
          </span>
          <span className="text-xs text-muted-foreground">
            {historyActorLabel(entry.changedBy, customerUserId)} ·{" "}
            {timestampFormatter.format(new Date(entry.changedAt))}
          </span>
        </li>
      ))}
    </ol>
  );
}
