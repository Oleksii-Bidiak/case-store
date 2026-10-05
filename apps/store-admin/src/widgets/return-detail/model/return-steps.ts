import { ReturnEntityStatus, returnStatusLabel } from "@/entities/return";
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

/**
 * The request's path as steps (ReturnsProposal Р3–Р5): what is done, the one
 * the shop is on now («зараз» — the next move), what is still ahead.
 *
 * Only the dates the API keeps are printed: `requestedAt` on «Запит», and
 * `resolvedAt` — the LAST decision — on the latest done step; the dates of
 * earlier decisions are not stored (the step history is an API tail). A
 * refused request ends at «Відхилено» after «Запит».
 */
export function returnSteps(
  rma: Pick<ReturnEntity, "status" | "requestedAt" | "resolvedAt">,
): StepperStep[] {
  const decided = rma.resolvedAt ? formatDate(rma.resolvedAt) : undefined;
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
        description: decided,
        state: "done",
      },
    ];
  }

  const reached = PATH.indexOf(rma.status);
  const finished = rma.status === ReturnEntityStatus.REFUNDED;

  return PATH.map((status, index) => {
    if (index === 0) return requested;
    const isDone = index <= reached;
    const isNow = !finished && index === reached + 1;
    return {
      id: status,
      title: returnStatusLabel(status),
      description:
        isDone && index === reached ? decided : isNow ? d.stepNow : undefined,
      state: isDone ? "done" : isNow ? "now" : "todo",
    };
  });
}
