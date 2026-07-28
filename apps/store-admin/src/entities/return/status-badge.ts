import { ReturnEntityStatus } from "@/shared/api";

type BadgeVariant =
  "default" | "secondary" | "destructive" | "outline" | "success" | "warning";

/**
 * Map a return status to a `Badge` variant (TASK-340), on the same colour
 * grammar as `entities/order/status-badge.ts`: amber = waiting on us, indigo =
 * in progress, green = finished well, red = refused.
 *
 * REFUNDED is green rather than red. On an ORDER the same word is a loss; on a
 * RETURN it is the request completing exactly as it should, and colouring it as
 * an alarm would train operators to ignore the colour.
 */
export function returnStatusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case ReturnEntityStatus.APPROVED:
    case ReturnEntityStatus.RECEIVED:
      return "default";
    case ReturnEntityStatus.REFUNDED:
      return "success";
    case ReturnEntityStatus.REJECTED:
      return "destructive";
    case ReturnEntityStatus.REQUESTED:
    default:
      return "warning";
  }
}
