"use client";

import { useId, useRef } from "react";
import { CheckIcon } from "lucide-react";
import {
  ReturnDecision,
  ReturnRepairStep,
  type ReturnEntity,
} from "@/entities/return";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { Callout } from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatDate, formatDateTime } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import {
  REPAIR_STEP_ORDER,
  isUnrepairable,
  nextRepairStep,
  repairAcceptsSteps,
  repairResultLabel,
  repairTimeline,
  type RepairEntryState,
  type RepairTimelineEntry,
} from "../model/repair-steps";
import { ReturnRepairStepForm } from "./return-repair-step-form";

const d = dict.returns;

interface ReturnRepairPanelProps {
  rma: ReturnEntity;
  /**
   * The id of the «Рішення» card on the page. The hint after «не підлягає
   * ремонту» links to it — the page owns both cards, so it passes the anchor.
   */
  decisionAnchorId: string;
}

const STATE_TEXT: Record<RepairEntryState, string> = {
  done: d.repairStepDone,
  next: d.repairStepNext,
  todo: d.repairStepPending,
};

function Detail({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-x-1.5">
      <dt className="text-muted-foreground">{term}:</dt>
      <dd className="min-w-0 break-words whitespace-pre-line text-foreground">
        {value}
      </dd>
    </div>
  );
}

function TimelineEntry({
  entry,
  index,
  rma,
}: {
  entry: RepairTimelineEntry;
  index: number;
  rma: ReturnEntity;
}) {
  const recorded = entry.recorded;
  const when =
    entry.id === "DECISION"
      ? rma.decidedAt
        ? d.repairRecordedBy(
            formatDateTime(rma.decidedAt),
            rma.decidedBy?.name ?? null,
          )
        : null
      : recorded
        ? d.repairRecordedBy(
            formatDateTime(recorded.createdAt),
            recorded.actor?.name ?? null,
          )
        : null;
  const isHandover = entry.id === ReturnRepairStep.HANDED_TO_CUSTOMER;

  return (
    <li
      data-state={entry.state}
      aria-current={entry.state === "next" ? "step" : undefined}
      className="flex gap-3"
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground",
          entry.state === "next" && "bg-primary text-primary-foreground",
          entry.state === "done" && "bg-success text-success-foreground",
        )}
      >
        {entry.state === "done" ? (
          <CheckIcon className="size-3.5" />
        ) : (
          index + 1
        )}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5 text-sm">
        <span
          className={cn(
            "font-semibold",
            entry.state === "todo"
              ? "text-muted-foreground"
              : "text-foreground",
          )}
        >
          {entry.title}
          <span className="sr-only">{`, ${STATE_TEXT[entry.state]}`}</span>
        </span>
        {when ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {when}
          </span>
        ) : null}
        {recorded ? (
          <dl className="flex flex-col gap-0.5">
            {recorded.result ? (
              <Detail
                term={d.repairResultLegend}
                value={repairResultLabel(recorded.result)}
              />
            ) : null}
            {recorded.destination ? (
              <Detail
                term={isHandover ? d.repairPoint : d.repairService}
                value={recorded.destination}
              />
            ) : null}
            {recorded.ttn ? (
              <Detail term={d.repairTtn} value={recorded.ttn} />
            ) : null}
            {recorded.note ? (
              <Detail term={d.repairNote} value={recorded.note} />
            ) : null}
          </dl>
        ) : null}
      </div>
    </li>
  );
}

/**
 * «Ремонт» on a return decided as REPAIR (TASK-2045, B-12 §1.7): the five rows
 * — the decision, accepted from the customer, sent to the service, back from
 * it (repaired or not), handed to the customer — each recorded one with who,
 * when and the note; and, for a writer, the form for exactly the next step.
 *
 * - Nothing at all under any other decision: the panel is the repair, not a
 *   history of one (a repair abandoned for a refund keeps its trail in the
 *   decision history's reason).
 * - The purchase date stands next to the steps, with the plain statement that
 *   the warranty period is not checked — the operator judges it.
 * - «Не підлягає ремонту» does not change the decision on its own; the panel
 *   says so and points at the «Рішення» card, where it is changed with a
 *   reason the customer sees.
 */
export function ReturnRepairPanel({
  rma,
  decisionAnchorId,
}: ReturnRepairPanelProps) {
  const { can, arePermissionsLoading } = useAuth();
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  if (rma.decision !== ReturnDecision.REPAIR) return null;

  const steps = rma.repairSteps ?? [];
  const accepts = repairAcceptsSteps(rma);
  const next = accepts ? nextRepairStep(steps) : null;
  const canWrite = !arePermissionsLoading && can(PERM.returnsWrite);
  const unrepairable = isUnrepairable(steps);

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-card"
    >
      <div className="flex flex-col gap-1">
        <h3
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="rounded-xs text-sm font-semibold text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {d.repairHeading}
        </h3>
        <p className="text-xs text-muted-foreground">
          {rma.orderCreatedAt
            ? `${d.repairPurchaseDate(formatDate(rma.orderCreatedAt))} · `
            : null}
          {d.repairWarrantyNotChecked}
        </p>
      </div>

      <ol aria-label={d.repairStepsAria} className="flex flex-col gap-3">
        {repairTimeline(rma).map((entry, index) => (
          <TimelineEntry key={entry.id} entry={entry} index={index} rma={rma} />
        ))}
      </ol>

      {unrepairable && accepts ? (
        <Callout variant="warning">
          <span className="flex flex-col gap-1">
            <span>{d.repairUnrepairableHint}</span>
            <a
              href={`#${decisionAnchorId}`}
              className="w-fit rounded-xs font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {d.repairToDecision}
            </a>
          </span>
        </Callout>
      ) : null}

      {steps.length === REPAIR_STEP_ORDER.length ? (
        <p className="text-sm text-muted-foreground">{d.repairComplete}</p>
      ) : null}

      {canWrite && next !== null ? (
        <ReturnRepairStepForm
          key={next}
          rma={rma}
          step={next}
          onRecorded={() => headingRef.current?.focus()}
        />
      ) : null}
    </section>
  );
}
