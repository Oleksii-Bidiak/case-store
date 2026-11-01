import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { ReturnDecision, ReturnRepairStep, ReturnStatus } from '@prisma/client';

/**
 * Stable, machine-readable error codes for return resolution (TASK-785).
 *
 * Same shape as `order.errors.ts`: the admin panel keys its localized (UA)
 * messages off these strings, so they stay stable when the English message is
 * reworded. They reach the wire through the envelope's `error` field.
 */
export const ReturnErrorCode = {
  /**
   * PATCH was asked to set REFUNDED, which follows from the payouts on the order
   * ledger since R2 A3 (TASK-2046).
   */
  REFUND_DERIVED: 'RETURN_REFUND_DERIVED',
  /** The credit («до повернення») of a return not decided as REFUND (R2 A3). */
  CREDIT_NOT_REFUND: 'RETURN_CREDIT_NOT_REFUND',
  /** A credit above the computed value — it may only be lowered (R2 A3). */
  CREDIT_ABOVE_COMPUTED: 'RETURN_CREDIT_ABOVE_COMPUTED',
  /** A credit below what was already paid out on the return (R2 A3). */
  CREDIT_BELOW_PAID_OUT: 'RETURN_CREDIT_BELOW_PAID_OUT',
  /**
   * The order a return was asked against does not exist — or is not the
   * caller's, which the customer door deliberately reports identically
   * (TASK-1966).
   */
  ORDER_NOT_FOUND: 'RETURN_ORDER_NOT_FOUND',
  /** The return does not exist (TASK-1966). */
  NOT_FOUND: 'RETURN_NOT_FOUND',
  /** The order has not shipped yet — that is a cancellation, not a return (TASK-1966). */
  ORDER_NOT_RETURNABLE: 'RETURN_ORDER_NOT_RETURNABLE',
  /** A requested line does not belong to the order (TASK-1966). */
  ITEM_NOT_IN_ORDER: 'RETURN_ITEM_NOT_IN_ORDER',
  /** The units asked for plus those already claimed exceed what was bought (TASK-1966). */
  QUANTITY_EXCEEDED: 'RETURN_QUANTITY_EXCEEDED',
  /** The return state machine forbids the requested move (TASK-1966). */
  TRANSITION_INVALID: 'RETURN_TRANSITION_INVALID',
  /** The returned goods were already credited back to stock (TASK-1966). */
  ALREADY_RESTOCKED: 'RETURN_ALREADY_RESTOCKED',
  /** A restock was asked for on a status other than RECEIVED (TASK-1966). */
  RESTOCK_REQUIRES_RECEIVED: 'RETURN_RESTOCK_REQUIRES_RECEIVED',
  /** A refusal, or a change of a decision already made, came without a reason (TASK-1961). */
  DECISION_REASON_REQUIRED: 'RETURN_DECISION_REASON_REQUIRED',
  /** The return was refunded — its decision is final (TASK-2044). */
  DECISION_LOCKED: 'RETURN_DECISION_LOCKED',
  /** The same decision with the same reason — nothing would change (TASK-2044). */
  DECISION_UNCHANGED: 'RETURN_DECISION_UNCHANGED',
  /** A goods outcome over a return with money already paid out on it (SR1 review; ledger since R2 A3). */
  REFUND_RECORDED: 'RETURN_REFUND_RECORDED',
  /** PATCH was asked to set APPROVED or REJECTED, which only a decision may do (TASK-2044). */
  USE_DECISION_ENDPOINT: 'RETURN_USE_DECISION_ENDPOINT',
  /**
   * A repair step on a return not (or no longer) decided as REPAIR, out of order,
   * or already recorded (TASK-2045).
   */
  REPAIR_STEP_INVALID: 'RETURN_REPAIR_STEP_INVALID',
  /** RETURNED_FROM_SERVICE without its outcome (TASK-2045). */
  REPAIR_RESULT_REQUIRED: 'RETURN_REPAIR_RESULT_REQUIRED',
  /** An outcome on a step other than RETURNED_FROM_SERVICE (TASK-2045). */
  REPAIR_RESULT_NOT_ALLOWED: 'RETURN_REPAIR_RESULT_NOT_ALLOWED',
  /** PATCH with neither a status nor operatorNotes — nothing to write. */
  UPDATE_EMPTY: 'RETURN_UPDATE_EMPTY',
  /** restock sent without the status it belongs to. */
  STATUS_REQUIRED: 'RETURN_STATUS_REQUIRED',
} as const;

export type ReturnErrorCode = (typeof ReturnErrorCode)[keyof typeof ReturnErrorCode];

/** 400 for PATCH asked to set REFUNDED — it follows from the payouts (R2 A3, TASK-2046). */
export function refundIsDerivedError(): BadRequestException {
  return new BadRequestException({
    error: ReturnErrorCode.REFUND_DERIVED,
    message:
      'A return becomes REFUNDED when its payouts cover what is owed — record the payout on ' +
      'the order (POST /admin/orders/:orderId/money/out)',
  });
}

/** 409 for the credit of a return that is not decided as a refund (R2 A3). */
export function creditNotRefundError(): ConflictException {
  return new ConflictException({
    error: ReturnErrorCode.CREDIT_NOT_REFUND,
    message: 'Only a return decided as a refund has an amount to give back',
  });
}

/** 400 for a credit above the computed value (R2 A3): it may only be lowered. */
export function creditAboveComputedError(computedKop: number): BadRequestException {
  return new BadRequestException({
    error: ReturnErrorCode.CREDIT_ABOVE_COMPUTED,
    message: `The amount to give back may only be lowered — at most ${computedKop} kop`,
  });
}

/** 409 for a credit below the payouts already made on the return (R2 A3). */
export function creditBelowPaidOutError(paidOutKop: number): ConflictException {
  return new ConflictException({
    error: ReturnErrorCode.CREDIT_BELOW_PAID_OUT,
    message:
      `${paidOutKop} kop were already paid out on this return — the amount cannot be lower. ` +
      'Reverse a payout first.',
  });
}

/*
 * TASK-1966 — the refusals below kept their HTTP status and their English
 * message word for word (the storefront and older admin builds render the
 * message); what they gained is the stable `error` code the admin panel maps
 * to its own UA text.
 */

/**
 * 404 for an order that does not exist or is not the caller's. One body for
 * both, so the customer door never admits someone else's order exists.
 */
export function returnOrderNotFoundError(): NotFoundException {
  return new NotFoundException({
    error: ReturnErrorCode.ORDER_NOT_FOUND,
    message: 'Order not found',
  });
}

/** 404 for a return that does not exist. */
export function returnNotFoundError(): NotFoundException {
  return new NotFoundException({
    error: ReturnErrorCode.NOT_FOUND,
    message: 'Return not found',
  });
}

/** 400 for a return against an order whose goods have not left the shop. */
export function orderNotReturnableError(): BadRequestException {
  return new BadRequestException({
    error: ReturnErrorCode.ORDER_NOT_RETURNABLE,
    message: 'Only shipped or delivered orders can be returned — cancel the order instead',
  });
}

/** 400 for a requested line that belongs to another order. */
export function returnItemNotInOrderError(): BadRequestException {
  return new BadRequestException({
    error: ReturnErrorCode.ITEM_NOT_IN_ORDER,
    message: 'That item is not part of this order',
  });
}

/**
 * 400 for more units than the line has left. The remainder is named in the
 * message because it is the number the requester needs next.
 */
export function returnQuantityExceededError(
  requested: number,
  remaining: number,
): BadRequestException {
  return new BadRequestException({
    error: ReturnErrorCode.QUANTITY_EXCEEDED,
    message: `Cannot return ${requested} of that item — ${remaining} remain returnable`,
  });
}

/** 409 for a move the return state machine forbids; both ends are named. */
export function invalidReturnTransitionError(
  from: ReturnStatus,
  to: ReturnStatus,
): ConflictException {
  return new ConflictException({
    error: ReturnErrorCode.TRANSITION_INVALID,
    message: `A return cannot move from ${from} to ${to}`,
  });
}

/** 409 for a second restock — one box back, one increment. */
export function returnAlreadyRestockedError(): ConflictException {
  return new ConflictException({
    error: ReturnErrorCode.ALREADY_RESTOCKED,
    message: 'These returned goods have already been credited back to inventory',
  });
}

/** 400 for a restock asked for on any status but the one the goods arrive at. */
export function restockRequiresReceivedError(
  restockOn: ReturnStatus,
  requested: ReturnStatus,
): BadRequestException {
  return new BadRequestException({
    error: ReturnErrorCode.RESTOCK_REQUIRES_RECEIVED,
    message: `Stock is credited back when a return is marked ${restockOn}, not ${requested}`,
  });
}

/*
 * TASK-1961, TASK-2044 — decisions (B-12 theme 1.1).
 */

/**
 * 409 for re-opening a refusal whose units a newer request now holds. Same code
 * and message as the 400 on create — the fact is the same — but a 409 here,
 * because what conflicts is the return's state, not the request's shape.
 */
export function returnQuantityExceededOnReopenError(
  requested: number,
  remaining: number,
): ConflictException {
  return new ConflictException({
    error: ReturnErrorCode.QUANTITY_EXCEEDED,
    message: `Cannot return ${requested} of that item — ${remaining} remain returnable`,
  });
}

/** 400 for a refusal, or a change of an earlier decision, with no reason given. */
export function decisionReasonRequiredError(): BadRequestException {
  return new BadRequestException({
    error: ReturnErrorCode.DECISION_REASON_REQUIRED,
    message: 'A reason is required to reject a return or to change a decision already made',
  });
}

/** 409 for any decision on a refunded return. */
export function decisionLockedError(): ConflictException {
  return new ConflictException({
    error: ReturnErrorCode.DECISION_LOCKED,
    message: 'The return has been refunded — its decision can no longer change',
  });
}

/**
 * 409 for moving a return away from REFUND once money was paid out on it (R2
 * A3: payouts on the order ledger, net of reversals): a replacement or a repair
 * on top of it would leave money gone with no refund behind it. Reverse the
 * payouts first.
 */
export function refundRecordedError(decision: ReturnDecision): ConflictException {
  return new ConflictException({
    error: ReturnErrorCode.REFUND_RECORDED,
    message: `Money was already paid out on this return — it cannot become ${decision}`,
  });
}

/** 409 for a decision identical to the current one, reason included. */
export function decisionUnchangedError(decision: ReturnDecision): ConflictException {
  return new ConflictException({
    error: ReturnErrorCode.DECISION_UNCHANGED,
    message: `The return already carries the decision ${decision} with this reason`,
  });
}

/** 400 for PATCH asked to set a status only a decision may set. */
export function useDecisionEndpointError(requested: ReturnStatus): BadRequestException {
  return new BadRequestException({
    error: ReturnErrorCode.USE_DECISION_ENDPOINT,
    message: `${requested} is set by a decision — use POST /admin/returns/:returnId/decision`,
  });
}

/** 400 for a PATCH that carries neither a status nor notes. */
export function returnUpdateEmptyError(): BadRequestException {
  return new BadRequestException({
    error: ReturnErrorCode.UPDATE_EMPTY,
    message: 'Nothing to update — send a status, operatorNotes, or both',
  });
}

/** 400 for a restock sent on a notes-only PATCH — it belongs to a status step. */
export function returnStatusRequiredError(): BadRequestException {
  return new BadRequestException({
    error: ReturnErrorCode.STATUS_REQUIRED,
    message: 'restock moves a return on — send it with a status',
  });
}

/*
 * TASK-2045 — repair steps (B-12 theme 1.7).
 */

/**
 * 409 for a repair step on a return that is not an open REPAIR: never decided
 * as one, moved to another decision (an UNREPAIRABLE item), or closed.
 */
export function repairNotInProgressError(): ConflictException {
  return new ConflictException({
    error: ReturnErrorCode.REPAIR_STEP_INVALID,
    message: 'Repair steps are recorded only on an open return decided as REPAIR',
  });
}

/**
 * 409 for a step out of order — skipped, repeated, or after the repair ended.
 * The step expected next is named, since it is the one the operator needs.
 */
export function repairStepOutOfOrderError(
  expected: ReturnRepairStep | null,
  requested: ReturnRepairStep,
): ConflictException {
  return new ConflictException({
    error: ReturnErrorCode.REPAIR_STEP_INVALID,
    message:
      expected === null
        ? 'The repair is complete — no step follows HANDED_TO_CUSTOMER'
        : `The next repair step is ${expected}, not ${requested}`,
  });
}

/** 409 for a step a concurrent request recorded first (the unique index fired). */
export function repairStepAlreadyRecordedError(step: ReturnRepairStep): ConflictException {
  return new ConflictException({
    error: ReturnErrorCode.REPAIR_STEP_INVALID,
    message: `The repair step ${step} has already been recorded`,
  });
}

/** 400 for an item back from the service with no word on whether it was fixed. */
export function repairResultRequiredError(step: ReturnRepairStep): BadRequestException {
  return new BadRequestException({
    error: ReturnErrorCode.REPAIR_RESULT_REQUIRED,
    message: `${step} needs a result: REPAIRED or UNREPAIRABLE`,
  });
}

/** 400 for an outcome sent with a step that does not carry one. */
export function repairResultNotAllowedError(
  carrier: ReturnRepairStep,
  step: ReturnRepairStep,
): BadRequestException {
  return new BadRequestException({
    error: ReturnErrorCode.REPAIR_RESULT_NOT_ALLOWED,
    message: `A result is recorded only on ${carrier}, not on ${step}`,
  });
}
