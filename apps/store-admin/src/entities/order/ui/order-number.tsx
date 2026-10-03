import { cn } from "@/shared/lib/utils";
import { formatOrderNumber } from "../lib/format-order-number";

export interface OrderNumberProps {
  /** The order's full id (UUID). */
  id: string;
  className?: string;
}

/**
 * «#7C1E9A42» in mono 13 px, the full id in the `title` (TASK-1038). Mono so
 * the eight characters line up down a column and «0»/«O» stay distinct.
 */
export function OrderNumber({ id, className }: OrderNumberProps) {
  return (
    <span
      title={id}
      className={cn(
        "font-mono text-pill font-medium tracking-wide tabular-nums",
        className,
      )}
    >
      {formatOrderNumber(id)}
    </span>
  );
}
