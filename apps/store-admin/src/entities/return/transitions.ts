import { ReturnEntityStatus } from "@/shared/api";

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
 * Nothing leaves REJECTED or REFUNDED. A refused return that is later argued
 * successfully is a NEW request: the refusal was communicated to a customer, and
 * rewriting it in place erases the fact that it happened.
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
