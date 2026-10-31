"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import {
  returnDecisionLabel,
  type ReturnDecisionEventEntity,
  type ReturnEntity,
} from "@/entities/return";
import { ReturnDecideForm } from "@/features/return-decide";
import { Badge, Button } from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatDateTime } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";

const d = dict.returns;

/** «до B-12» — a decision inferred by the backfill; nobody wrote a reason. */
function LegacyMarker() {
  return (
    <Badge variant="outline" className="font-normal text-muted-foreground">
      {d.decisionLegacyMarker}
    </Badge>
  );
}

/** The reason as the customer reads it, or why there is none. */
function reasonOf(reason: string | null, legacy: boolean): ReactNode {
  if (reason) return reason;
  return legacy ? <LegacyMarker /> : d.decisionNoReason;
}

function Row({ term, children }: { term: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="min-w-0 break-words whitespace-pre-line text-foreground">
        {children}
      </dd>
    </div>
  );
}

function HistoryEntry({ event }: { event: ReturnDecisionEventEntity }) {
  return (
    <li className="flex flex-col gap-0.5 border-l-2 pl-3 text-sm">
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium text-foreground">
          {returnDecisionLabel(event.decision)}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDateTime(event.createdAt)}
          {event.actor ? ` · ${event.actor.name}` : ""}
        </span>
      </span>
      <span
        className={cn(
          "break-words whitespace-pre-line",
          event.reason ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {reasonOf(event.reason, event.legacy)}
      </span>
    </li>
  );
}

/**
 * «Рішення» of a return (TASK-1961, TASK-2044; B-12 §1.1): what was decided,
 * why — the reason the customer is shown, and the card says so in plain text
 * («бачить покупець») — who decided and when, and every earlier decision
 * folded under «Історія рішень». A decision the backfill inferred from a
 * pre-B-12 status carries no reason and no author; it says «до B-12» rather
 * than looking like a decision someone took without explaining it.
 *
 * The decide form (`features/return-decide`) sits at the bottom for a session
 * holding `returns:write`; it hides itself on a REFUNDED return.
 */
export function ReturnDecisionCard({
  rma,
  id,
}: {
  rma: ReturnEntity;
  /** Anchor for links from elsewhere on the page (the repair panel's hint). */
  id?: string;
}) {
  const headingId = useId();
  const historyId = useId();
  const [historyOpen, setHistoryOpen] = useState(false);
  const history = rma.decisionHistory ?? [];
  const historyLabel = d.decisionHistoryToggle(history.length);

  return (
    <section
      id={id}
      // Focusable from code only: following the anchor lands focus here, so the
      // next Tab reaches «Змінити рішення…».
      tabIndex={id ? -1 : undefined}
      aria-labelledby={headingId}
      className="flex scroll-mt-4 flex-col gap-3 rounded-lg border bg-card p-4 shadow-card outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <h3 id={headingId} className="text-sm font-semibold text-foreground">
        {d.decisionHeading}
      </h3>

      {rma.decision === null ? (
        <p className="text-sm text-muted-foreground">{d.decisionNone}</p>
      ) : (
        <>
          <p className="font-display text-lg font-semibold text-foreground">
            {returnDecisionLabel(rma.decision)}
          </p>
          <dl className="flex flex-col gap-2 text-sm">
            <Row
              term={
                <>
                  {d.decisionReason} ·{" "}
                  <span className="font-medium">{d.decisionReasonHint}</span>
                </>
              }
            >
              {reasonOf(rma.decisionReason, rma.decisionLegacy)}
              {rma.decisionLegacy && !rma.decisionReason ? (
                <span className="mt-1 block text-xs text-muted-foreground">
                  {d.decisionLegacyHint}
                </span>
              ) : null}
            </Row>
            <Row term={d.decisionAuthor}>
              {rma.decidedBy?.name ?? d.decisionAuthorUnknown}
            </Row>
            <Row term={d.decisionDate}>
              {rma.decidedAt ? formatDateTime(rma.decidedAt) : "—"}
            </Row>
          </dl>
        </>
      )}

      {history.length > 1 ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto w-fit p-0"
            aria-expanded={historyOpen}
            aria-controls={historyId}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            {historyLabel}
            {historyOpen ? (
              <ChevronUpIcon aria-hidden="true" />
            ) : (
              <ChevronDownIcon aria-hidden="true" />
            )}
          </Button>
          {historyOpen ? (
            <ol
              id={historyId}
              aria-label={historyLabel}
              className="flex flex-col gap-2"
            >
              {history.map((event) => (
                <HistoryEntry
                  key={`${event.createdAt}-${event.decision}`}
                  event={event}
                />
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}

      <ReturnDecideForm rma={rma} />
    </section>
  );
}
