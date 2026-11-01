import { ReturnDecision, ReturnEntityStatus } from "@/shared/api";

/**
 * Client-side mirror of the backend return state machine
 * (`order/returns/return-state-machine.ts`), TASK-340.
 *
 * ── Why this is a mirror and the order picker is not ────────────────────────
 * The ORDER status picker was deliberately stripped of its local table in
 * TASK-332, because the server publishes the legal moves at
 * `GET /admin/orders/:id/allowed-transitions` and a second copy would only
 * drift. Returns have no such endpoint, so this table is the only way to offer a
 * short, correct list instead of all five statuses.
 *
 * That makes drift a real risk, and it is handled in two ways rather than
 * ignored: the table is pinned by a unit test that spells out every row, and the
 * resolve form treats a 409 as authoritative — if the server disagrees, the
 * server wins and the operator is told the return has moved. **Replace this with
 * the server's own answer the moment a returns allowed-transitions endpoint
 * exists.**
 *
 *   REQUESTED ─→ APPROVED ─→ RECEIVED ─→ REFUNDED
 *       └────→ REJECTED         ↑
 *                    APPROVED ──┘ (and APPROVED may still be REJECTED)
 *
 * No STATUS step leaves REJECTED or REFUNDED. Since B-12 (TASK-2044) APPROVED
 * and REJECTED are not status writes at all: they follow from a decision, taken
 * through its own endpoint with a reason and an author, and a refusal may be
 * re-opened that way — see {@link availableDecisions} and
 * {@link nextResolveStep} below.
 */
const RETURN_TRANSITIONS: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    [ReturnEntityStatus.REQUESTED]: Object.freeze([
      ReturnEntityStatus.APPROVED,
      ReturnEntityStatus.REJECTED,
    ]),
    // Still refusable after approval — goods come back damaged, or turn out not
    // to be ours.
    [ReturnEntityStatus.APPROVED]: Object.freeze([
      ReturnEntityStatus.RECEIVED,
      ReturnEntityStatus.REJECTED,
    ]),
    [ReturnEntityStatus.RECEIVED]: Object.freeze([ReturnEntityStatus.REFUNDED]),
    [ReturnEntityStatus.REJECTED]: Object.freeze([]),
    [ReturnEntityStatus.REFUNDED]: Object.freeze([]),
  });

/** Every status reachable from `from`, as a fresh (caller-owned) array. */
export function allowedReturnTransitions(from: string): string[] {
  return [...(RETURN_TRANSITIONS[from] ?? [])];
}

/**
 * The status at which returned goods are physically back and may be credited to
 * sellable stock.
 *
 * RECEIVED, not REFUNDED: stock is about where the item is, money is about who
 * holds it, and a shop that waits for the refund to restock has sellable
 * inventory sitting invisible in a box.
 */
export const RESTOCK_ON_STATUS: string = ReturnEntityStatus.RECEIVED;

const POSITIVE_DECISIONS: readonly string[] = Object.freeze([
  ReturnDecision.REFUND,
  ReturnDecision.REPLACEMENT,
  ReturnDecision.REPAIR,
]);

/**
 * The decisions the operator may take from `status` (TASK-2044), mirroring
 * `returnStatusAfterDecision` on the server:
 *
 *  - REQUESTED / APPROVED / REJECTED — all four; a positive decision on a
 *    refused request re-opens it (the server re-checks the units are free).
 *  - RECEIVED — no refusal: the goods are already back on the shelf or in the
 *    workshop, and RECEIVED → REJECTED is not a move the state machine has.
 *  - REFUNDED — none: the money went back, the decision is locked.
 *
 * Whether a reason is required, and whether the pick changes anything, is the
 * decide form's business, not this table's.
 */
export function availableDecisions(status: string): string[] {
  switch (status) {
    case ReturnEntityStatus.REQUESTED:
    case ReturnEntityStatus.APPROVED:
    case ReturnEntityStatus.REJECTED:
      return [...POSITIVE_DECISIONS, ReturnDecision.REJECT];
    case ReturnEntityStatus.RECEIVED:
      return [...POSITIVE_DECISIONS];
    default:
      return [];
  }
}

/**
 * The one status step `PATCH /admin/returns/:id` still takes from here, or
 * `null` (TASK-2044). The PATCH refuses APPROVED and REJECTED
 * (`RETURN_USE_DECISION_ENDPOINT`), and RECEIVED → REFUNDED needs a REFUND
 * decision: a repair or a replacement never ends in «Гроші повернуто».
 */
export function nextResolveStep(
  status: string,
  decision: string | null,
): string | null {
  if (status === ReturnEntityStatus.APPROVED) {
    return ReturnEntityStatus.RECEIVED;
  }
  if (
    status === ReturnEntityStatus.RECEIVED &&
    decision === ReturnDecision.REFUND
  ) {
    return ReturnEntityStatus.REFUNDED;
  }
  return null;
}
