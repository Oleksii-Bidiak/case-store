"use client";

import { useId, type ReactNode } from "react";
import type {
  ReturnEntity,
  ReturnRepairStepEntity,
} from "@/shared/api/generated/models";
import { dict } from "@/shared/config";
import { formatDate } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import { summarizeReturns } from "../model/summarize-returns";
import { ReturnSummaryBadge } from "./return-summary-badge";

const r = dict.returnRequest;

/** The same short reference the order uses: the id's first 8, upper-cased. */
const returnRef = (id: string) => id.slice(0, 8).toUpperCase();

function Field({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}

function Decision({ row }: { row: ReturnEntity }) {
  if (!row.decision) {
    return <p className="text-sm text-muted-foreground">{r.decisionPending}</p>;
  }
  // A legacy (pre-B-12) decision carries no `decidedAt`; when the request was
  // resolved is the closest date there is.
  const decidedAt = row.decidedAt ?? row.resolvedAt;
  const reason = row.decisionReason?.trim();
  return (
    <div className="flex flex-col gap-1 text-sm">
      <dl className="flex flex-col gap-1">
        <Field term={r.decision}>
          <span className="font-medium">
            {r.decisionLabels[row.decision] ?? row.decision}
          </span>
          {decidedAt && (
            <span className="text-muted-foreground">
              {" · "}
              {r.decidedOn(formatDate(decidedAt))}
            </span>
          )}
        </Field>
        {reason && <Field term={r.decisionReason}>{reason}</Field>}
      </dl>
      {!reason && row.decisionLegacy && (
        <p className="text-muted-foreground">{r.decisionLegacy}</p>
      )}
    </div>
  );
}

function RepairSteps({ steps }: { steps: readonly ReturnRepairStepEntity[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="font-medium text-foreground">{r.repairTitle}</p>
      <ol aria-label={r.repairTitle} className="flex flex-col gap-1">
        {steps.map((step) => (
          <li
            key={step.step}
            className="flex flex-wrap justify-between gap-x-3 text-foreground"
          >
            <span>
              {r.repairStepLabels[step.step] ?? step.step}
              {step.result && (
                <span className="text-muted-foreground">
                  {": "}
                  {r.repairResultLabels[step.result] ?? step.result}
                </span>
              )}
            </span>
            <span className="text-muted-foreground">
              {formatDate(step.createdAt)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ReturnHistoryItem({ row }: { row: ReturnEntity }) {
  const headingId = `return-${row.id}-title`;
  return (
    <article
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-menu border border-border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={headingId} className="text-base font-semibold text-foreground">
          {r.historyItem(returnRef(row.id), formatDate(row.requestedAt))}
        </h3>
        <ReturnSummaryBadge summary={summarizeReturns([row])} />
      </div>

      <ul
        aria-label={r.historyItemsAria}
        className="flex flex-col gap-0.5 text-sm text-foreground"
      >
        {row.items.map((item) => (
          <li key={item.id}>
            {item.productName} × {item.quantity}
          </li>
        ))}
      </ul>

      {row.requestedOutcome && (
        <dl className="text-sm">
          <Field term={r.requestedOutcome}>
            {r.outcomeLabels[row.requestedOutcome] ?? row.requestedOutcome}
          </Field>
        </dl>
      )}

      <Decision row={row} />
      <RepairSteps steps={row.repairSteps ?? []} />
    </article>
  );
}

interface ReturnHistoryProps {
  returns: readonly ReturnEntity[];
  className?: string;
}

/**
 * ReturnHistory — every return request of one order, read-only (TASK-1962):
 * when it was filed, the lines × quantities, its status, what the customer
 * asked for, the decision with its reason and date (or a neutral «Причину не
 * вказано» for a legacy decision that never had a reason — the internal «до
 * B-12» label stays in the admin), and the repair steps.
 *
 * Presentational: the caller fetches. The account and the confirmation page
 * go through {@link OrderReturnHistory}; a guest view can feed its own list.
 * Renders nothing for an order without returns — most orders have none, and
 * an empty «Заяви на повернення» card would only be noise.
 */
export function ReturnHistory({ returns, className }: ReturnHistoryProps) {
  const titleId = useId();
  if (returns.length === 0) return null;
  return (
    <section
      aria-labelledby={titleId}
      data-testid="order-return-history"
      className={cn("flex flex-col gap-3.5", className)}
    >
      <h2 id={titleId} className="text-lg font-semibold text-foreground">
        {r.historyTitle}
      </h2>
      <div className="flex flex-col gap-3">
        {returns.map((row) => (
          <ReturnHistoryItem key={row.id} row={row} />
        ))}
      </div>
    </section>
  );
}
