import { ReturnChannel, ReturnDecision, ReturnOutcome } from "@/shared/api";
import { dict } from "@/shared/config";

const d = dict.returns;

/**
 * The operator's decision on a return in the words the shop uses (TASK-2044,
 * B-12 §1.1): «Гроші / Заміна / Ремонт / Відмова».
 *
 * `Record<Enum, string>` for exhaustiveness — a decision added to the schema
 * without a label here is a compile error, not a raw `REPAIR` on screen.
 */
const DECISION_LABELS: Record<ReturnDecision, string> = {
  [ReturnDecision.REFUND]: d.decisionREFUND,
  [ReturnDecision.REPLACEMENT]: d.decisionREPLACEMENT,
  [ReturnDecision.REPAIR]: d.decisionREPAIR,
  [ReturnDecision.REJECT]: d.decisionREJECT,
};

/** Map a raw decision enum to its Ukrainian label (falls back to input). */
export function returnDecisionLabel(decision: string): string {
  return DECISION_LABELS[decision as ReturnDecision] ?? decision;
}

/**
 * What the customer asked for. The same three words as the positive decisions,
 * on purpose: the operator compares «хоче ремонт» with «рішення: ремонт» at a
 * glance, and two vocabularies for one thing would hide a mismatch.
 */
const OUTCOME_LABELS: Record<ReturnOutcome, string> = {
  [ReturnOutcome.REFUND]: d.decisionREFUND,
  [ReturnOutcome.REPLACEMENT]: d.decisionREPLACEMENT,
  [ReturnOutcome.REPAIR]: d.decisionREPAIR,
};

/** «Гроші / Заміна / Ремонт», or «не вказано» when the customer did not say. */
export function returnOutcomeLabel(outcome: string | null): string {
  if (outcome === null) return d.outcomeNotGiven;
  return OUTCOME_LABELS[outcome as ReturnOutcome] ?? outcome;
}

/**
 * The heading over `reason` depends on who wrote it (TASK-1961): through the
 * account or the guest link it is the customer's own words; an operator filing
 * the request for them writes a comment of their own.
 */
export function returnReasonHeading(channel: string): string {
  return channel === ReturnChannel.OPERATOR ? d.reasonOperator : d.reason;
}
