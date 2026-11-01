import { dict } from "@/shared/config";
import { Badge } from "@/shared/ui";
import type {
  ReturnsSummary,
  ReturnsSummaryTone,
} from "../model/summarize-returns";

/** Existing Badge variants only; a completed refund is the solid success one. */
const VARIANT: Record<ReturnsSummaryTone, "secondary" | "success" | "outline"> =
  {
    active: "secondary",
    done: "success",
    rejected: "outline",
  };

/**
 * The return pill (TASK-608, TASK-1962): one request's status, or the count
 * of several. A single status is named by an sr-only prefix; the several-line
 * «Повернення: …» names itself.
 */
export function ReturnSummaryBadge({
  summary,
}: {
  summary: ReturnsSummary | null | undefined;
}) {
  if (!summary) return null;
  return (
    <Badge variant={VARIANT[summary.tone]} data-return-status={summary.status}>
      {!summary.several && (
        <span className="sr-only">{`${dict.returnRequest.statusSr}: `}</span>
      )}
      {summary.label}
    </Badge>
  );
}
