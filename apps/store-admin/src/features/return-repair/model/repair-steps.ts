import {
  RepairResult,
  ReturnDecision,
  ReturnEntityStatus,
  ReturnRepairStep,
  type ReturnEntity,
  type ReturnRepairStepEntity,
} from "@/entities/return";
import { dict } from "@/shared/config";

const d = dict.returns;

/**
 * The four steps an operator records, in the only order they can happen —
 * the API's `REPAIR_STEP_ORDER` (`order/returns/return-state-machine.ts`).
 */
export const REPAIR_STEP_ORDER: readonly ReturnRepairStep[] = [
  ReturnRepairStep.ACCEPTED,
  ReturnRepairStep.SENT_TO_SERVICE,
  ReturnRepairStep.RETURNED_FROM_SERVICE,
  ReturnRepairStep.HANDED_TO_CUSTOMER,
];

/** `Record<Enum, string>` — a step added to the schema is a compile error here. */
const STEP_LABELS: Record<ReturnRepairStep, string> = {
  [ReturnRepairStep.ACCEPTED]: d.repairStepACCEPTED,
  [ReturnRepairStep.SENT_TO_SERVICE]: d.repairStepSENT_TO_SERVICE,
  [ReturnRepairStep.RETURNED_FROM_SERVICE]: d.repairStepRETURNED_FROM_SERVICE,
  [ReturnRepairStep.HANDED_TO_CUSTOMER]: d.repairStepHANDED_TO_CUSTOMER,
};

const RESULT_LABELS: Record<RepairResult, string> = {
  [RepairResult.REPAIRED]: d.repairResultREPAIRED,
  [RepairResult.UNREPAIRABLE]: d.repairResultUNREPAIRABLE,
};

export function repairStepLabel(step: ReturnRepairStep): string {
  return STEP_LABELS[step] ?? step;
}

export function repairResultLabel(result: RepairResult): string {
  return RESULT_LABELS[result] ?? result;
}

/**
 * The step that may be recorded next, or `null` once the goods are back with
 * the customer. Counted, not searched — the API does the same, and a list the
 * server accepted is always a prefix of the order.
 */
export function nextRepairStep(
  steps: readonly Pick<ReturnRepairStepEntity, "step">[],
): ReturnRepairStep | null {
  return REPAIR_STEP_ORDER[steps.length] ?? null;
}

/**
 * Whether a step may be recorded at all — the API's `repairAcceptsSteps`: an
 * open return decided as REPAIR. A REJECTED or REFUNDED return is closed.
 */
export function repairAcceptsSteps(
  rma: Pick<ReturnEntity, "status" | "decision">,
): boolean {
  return (
    rma.decision === ReturnDecision.REPAIR &&
    rma.status !== ReturnEntityStatus.REJECTED &&
    rma.status !== ReturnEntityStatus.REFUNDED
  );
}

/** The service said it cannot be fixed — the decision has to change (B-12 §1.7). */
export function isUnrepairable(
  steps: readonly Pick<ReturnRepairStepEntity, "result">[],
): boolean {
  return steps.some((step) => step.result === RepairResult.UNREPAIRABLE);
}

export type RepairEntryState = "done" | "next" | "todo";

export interface RepairTimelineEntry {
  /** `DECISION` for the first row, otherwise the step. */
  id: "DECISION" | ReturnRepairStep;
  title: string;
  state: RepairEntryState;
  /** The recorded step, when it was recorded. */
  recorded: ReturnRepairStepEntity | null;
}

/**
 * The five rows of a repair (TASK-2045, B-12 §1.7): the decision «Ремонт»
 * itself, then the four recorded steps. A step is «next» only while the
 * return still accepts one — a closed return shows what happened, not a hole
 * to fill.
 */
export function repairTimeline(
  rma: Pick<ReturnEntity, "status" | "decision" | "repairSteps">,
): RepairTimelineEntry[] {
  const steps = rma.repairSteps ?? [];
  const next = repairAcceptsSteps(rma) ? nextRepairStep(steps) : null;
  return [
    {
      id: "DECISION",
      title: d.repairStepDecision,
      state: "done",
      recorded: null,
    },
    ...REPAIR_STEP_ORDER.map((step): RepairTimelineEntry => {
      const recorded = steps.find((entry) => entry.step === step) ?? null;
      return {
        id: step,
        title: repairStepLabel(step),
        state: recorded ? "done" : step === next ? "next" : "todo",
        recorded,
      };
    }),
  ];
}
