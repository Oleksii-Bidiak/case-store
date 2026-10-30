import { ReturnDecision, ReturnStatus } from '@prisma/client';

/**
 * The return (RMA) state machine (TASK-340).
 *
 * Same shape and same reasoning as `order-state-machine.ts`: a pure table, no
 * NestJS, no Prisma, so the rules can be argued about and tested without a
 * database.
 *
 * ── Why RECEIVED and REFUNDED are separate ──────────────────────────────────
 * The goods coming back and the money going out are two events that routinely
 * happen days apart — the parcel arrives Tuesday, the accountant refunds Friday.
 * Conflating them is how a shop refunds twice: once when the courier's tracking
 * says "delivered to sender", once when the box is actually opened. The schema
 * comment on `Return` says the same thing; this table enforces it.
 *
 *   REQUESTED ─→ APPROVED ─→ RECEIVED ─→ REFUNDED
 *       └────→ REJECTED
 *
 * Nothing leaves REJECTED or REFUNDED through this table. Since B-12 (TASK-1961,
 * TASK-2044) APPROVED and REJECTED are the EFFECT of an operator's decision, not
 * a status anyone sets: see {@link returnStatusAfterDecision}. That is the one
 * door out of REJECTED — a changed decision, with a reason and a history row, so
 * the refusal that was communicated is never erased, only superseded.
 */
export const RETURN_TRANSITIONS: Readonly<Record<ReturnStatus, readonly ReturnStatus[]>> =
  Object.freeze({
    [ReturnStatus.REQUESTED]: Object.freeze([ReturnStatus.APPROVED, ReturnStatus.REJECTED]),
    // A return can still be refused after approval — the goods can come back
    // damaged, or turn out not to be ours.
    [ReturnStatus.APPROVED]: Object.freeze([ReturnStatus.RECEIVED, ReturnStatus.REJECTED]),
    [ReturnStatus.RECEIVED]: Object.freeze([ReturnStatus.REFUNDED]),
    [ReturnStatus.REJECTED]: Object.freeze([]),
    [ReturnStatus.REFUNDED]: Object.freeze([]),
  });

/**
 * The status at which the returned goods are physically back in the warehouse and
 * may be credited to sellable stock.
 *
 * RECEIVED, not REFUNDED: stock is about where the item is, money is about who
 * holds it, and a shop that waits for the refund to restock has salable inventory
 * sitting invisible in a box.
 */
export const RESTOCK_ON_STATUS: ReturnStatus = ReturnStatus.RECEIVED;

/** Whether a return may move from `from` to `to`. */
export function canTransitionReturn(from: ReturnStatus, to: ReturnStatus): boolean {
  return RETURN_TRANSITIONS[from].includes(to);
}

/** Every status reachable from `from`, as a fresh (caller-owned) array. */
export function allowedReturnTransitions(from: ReturnStatus): ReturnStatus[] {
  return [...RETURN_TRANSITIONS[from]];
}

/**
 * What a decision does to the status (TASK-1961, TASK-2044), or `null` when the
 * decision cannot be taken from `from`.
 *
 * - REJECT refuses from REQUESTED or APPROVED (the table's own refusal edges),
 *   and keeps a REJECTED return refused when the refusal is only re-worded.
 *   Goods already RECEIVED cannot be refused: they may already be back in stock.
 * - REFUND / REPLACEMENT / REPAIR approve a fresh request or re-open a refused
 *   one, and leave APPROVED and RECEIVED where they are — where the goods are is
 *   not what the operator decided.
 * - Nothing is decided on REFUNDED: the money is gone.
 */
export function returnStatusAfterDecision(
  from: ReturnStatus,
  decision: ReturnDecision,
): ReturnStatus | null {
  if (from === ReturnStatus.REFUNDED) {
    return null;
  }

  if (decision === ReturnDecision.REJECT) {
    if (from === ReturnStatus.REJECTED) {
      return ReturnStatus.REJECTED;
    }
    return canTransitionReturn(from, ReturnStatus.REJECTED) ? ReturnStatus.REJECTED : null;
  }

  if (from === ReturnStatus.REQUESTED || from === ReturnStatus.REJECTED) {
    return ReturnStatus.APPROVED;
  }
  return from;
}

/**
 * Whether the current decision allows a PATCH move to `to` (TASK-2044).
 *
 * Money goes out only on a REFUND decision: a replacement or a repair is paid
 * for in goods, and a refusal in nothing. Rows from before B-12 carry REFUND from
 * the R1 backfill, so their RECEIVED → REFUNDED path is unchanged.
 */
export function decisionPermitsTransition(
  to: ReturnStatus,
  decision: ReturnDecision | null,
): boolean {
  if (to === ReturnStatus.REFUNDED) {
    return decision === ReturnDecision.REFUND;
  }
  return true;
}
