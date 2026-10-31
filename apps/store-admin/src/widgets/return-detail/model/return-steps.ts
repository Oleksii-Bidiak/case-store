import {
  ReturnDecision,
  ReturnEntityStatus,
  returnStatusLabel,
} from "@/entities/return";
import type { ReturnEntity } from "@/entities/return";
import type { StepperStep } from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatDate } from "@/shared/lib";

const d = dict.returns;

const PATH: readonly string[] = [
  ReturnEntityStatus.REQUESTED,
  ReturnEntityStatus.APPROVED,
  ReturnEntityStatus.RECEIVED,
  ReturnEntityStatus.REFUNDED,
];

/** What the path needs to know about a return. */
export type ReturnStepsSource = Pick<
  ReturnEntity,
  | "status"
  | "requestedAt"
  | "resolvedAt"
  | "decidedAt"
  | "restockedAt"
  | "decisionHistory"
>;

/**
 * When the return was last approved: the earliest decision of the trailing run
 * of positive ones. REFUND on the 2nd changed to REPAIR on the 9th was approved
 * on the 2nd; a refusal re-opened on the 9th was approved on the 9th. Without a
 * history (list responses omit it) — the current decision's date.
 */
function approvedAt(rma: ReturnStepsSource): string | null {
  const history = rma.decisionHistory ?? [];
  let at: string | null = null;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].decision === ReturnDecision.REJECT) break;
    at = history[i].createdAt;
  }
  return at ?? rma.decidedAt;
}

/**
 * The request's path as steps (ReturnsProposal Р3–Р5): what is done, the one
 * the shop is on now («зараз» — the next move), what is still ahead. A refused
 * request ends at «Відхилено» after «Запит».
 *
 * Each step is dated by the fact that made it (TASK-1961, AD-RET-05/06):
 *  - «Запит» — `requestedAt`;
 *  - «Схвалено» / «Відхилено» — the decision (`decidedAt`, see `approvedAt`);
 *  - «Товар отримано» — `restockedAt` when the goods went back on the shelf,
 *    otherwise no date: the API keeps no «received at», and `resolvedAt` is
 *    the LAST change of any kind (a later decision or repair step moves it);
 *  - «Гроші повернуто» — `resolvedAt`, safe there: nothing follows a refund.
 */
export function returnSteps(rma: ReturnStepsSource): StepperStep[] {
  const date = (value: string | null | undefined) =>
    value ? formatDate(value) : undefined;
  const requested: StepperStep = {
    id: ReturnEntityStatus.REQUESTED,
    title: returnStatusLabel(ReturnEntityStatus.REQUESTED),
    description: formatDate(rma.requestedAt),
    state: "done",
  };

  if (rma.status === ReturnEntityStatus.REJECTED) {
    return [
      requested,
      {
        id: ReturnEntityStatus.REJECTED,
        title: returnStatusLabel(ReturnEntityStatus.REJECTED),
        description: date(rma.decidedAt ?? rma.resolvedAt),
        state: "done",
      },
    ];
  }

  const doneDate: Record<string, string | undefined> = {
    [ReturnEntityStatus.APPROVED]: date(approvedAt(rma) ?? rma.resolvedAt),
    [ReturnEntityStatus.RECEIVED]: date(rma.restockedAt),
    [ReturnEntityStatus.REFUNDED]: date(rma.resolvedAt),
  };

  const reached = PATH.indexOf(rma.status);
  const finished = rma.status === ReturnEntityStatus.REFUNDED;

  return PATH.map((status, index) => {
    if (index === 0) return requested;
    const isDone = index <= reached;
    const isNow = !finished && index === reached + 1;
    return {
      id: status,
      title: returnStatusLabel(status),
      description: isDone ? doneDate[status] : isNow ? d.stepNow : undefined,
      state: isDone ? "done" : isNow ? "now" : "todo",
    };
  });
}
