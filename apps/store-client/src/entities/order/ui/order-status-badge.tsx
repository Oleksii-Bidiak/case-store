import type { ReactNode } from "react";
import { Badge } from "@/shared/ui";
import { statusBadgeStyle } from "../lib/status-badge";

interface OrderStatusBadgeProps {
  /** An order OR payment status value, e.g. `SHIPPED` or `PAID`. */
  status: string;
  /** The visible Ukrainian label — the caller picks the order or payment map. */
  children: ReactNode;
  /**
   * What the badge is, for a screen reader, when nothing around it says so
   * (the order history row). Inside a `<dl>` the `<dt>` already names it —
   * leave this out there.
   */
  srLabel?: string;
}

/**
 * OrderStatusBadge — the one status pill of the order screens (TASK-868):
 * `/orders`, the confirmation page, the guest order view and `/orders/status`.
 *
 * Colour comes from `STATUS_BADGE` (design-system.md §2) and is carried by the
 * tint and the dot; the label is always `text-foreground`, so it stays ≥ 4.5:1
 * whatever the group. The name is plain text (an `sr-only` prefix), not an
 * `aria-label` — ARIA does not allow naming a `<span>` that has no role.
 */
export function OrderStatusBadge({
  status,
  children,
  srLabel,
}: OrderStatusBadgeProps) {
  const style = statusBadgeStyle(status);

  return (
    <Badge
      variant={style.variant}
      size="pill"
      dot
      className={style.shade}
      data-status={status}
    >
      {srLabel && <span className="sr-only">{`${srLabel}: `}</span>}
      <span>{children}</span>
    </Badge>
  );
}
