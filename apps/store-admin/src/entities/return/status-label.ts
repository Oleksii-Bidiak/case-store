import { ReturnEntityStatus } from "@/shared/api";
import { dict } from "@/shared/config";

/**
 * Ukrainian display labels for the return (RMA) lifecycle (TASK-340).
 *
 * `Record<Enum, string>` for exhaustiveness — a status added to the schema
 * without a label here is a compile error, not a raw `RECEIVED` on screen.
 *
 * RECEIVED and REFUNDED are worded so an operator cannot read one as the other:
 * «Товар отримано» is about where the goods are, «Гроші повернуто» is about who
 * holds the money. The backend keeps them as separate states for exactly that
 * reason — conflating them is how a shop refunds the same return twice.
 */
const RETURN_STATUS_LABELS: Record<ReturnEntityStatus, string> = {
  [ReturnEntityStatus.REQUESTED]: dict.returns.statusREQUESTED,
  [ReturnEntityStatus.APPROVED]: dict.returns.statusAPPROVED,
  [ReturnEntityStatus.REJECTED]: dict.returns.statusREJECTED,
  [ReturnEntityStatus.RECEIVED]: dict.returns.statusRECEIVED,
  [ReturnEntityStatus.REFUNDED]: dict.returns.statusREFUNDED,
};

/** Map a raw return-status enum to its Ukrainian label (falls back to input). */
export function returnStatusLabel(status: string): string {
  return RETURN_STATUS_LABELS[status as ReturnEntityStatus] ?? status;
}
