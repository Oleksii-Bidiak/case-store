import { ReturnStatus } from '@prisma/client';

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
 * Nothing leaves REJECTED or REFUNDED. A customer whose return was refused and
 * who then argues successfully is a NEW request, not an edited old one — the
 * refusal is a decision that was communicated, and rewriting it in place erases
 * the fact that it happened.
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
