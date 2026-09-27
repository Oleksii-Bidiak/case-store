import { dict } from "@/shared/config";
import { apiErrorCode, apiErrorStatus } from "@/shared/lib";

/**
 * Decoding the 409s the order endpoints raise, into something an operator can
 * act on (TASK-332).
 *
 * The codes below mirror `apps/store-api/src/order/order.errors.ts`. They are
 * the contract — deliberately stable so the wording can be reworked without
 * touching the server — and the wording is ours. The client NEVER echoes a raw
 * backend message: those are English, written for a log, and one of them names
 * both ends of a transition an operator never asked about.
 *
 * Same discipline as `dict.reorderList.rejected` (TASK-295), for the same
 * reason: an unrecognised code must still produce a sentence, and that sentence
 * must not be blank.
 */
export const ORDER_CONFLICT_CODE = {
  /** The order changed after the client read it — a lost update (E-11). */
  STALE: "ORDER_STALE",
  /** The state machine forbids this move. */
  TRANSITION_INVALID: "ORDER_TRANSITION_INVALID",
  /**
   * The order cannot go back to a live status while its money is recorded as
   * fully returned (review of plan 180).
   */
  REVIVE_REFUNDED_PAYMENT: "ORDER_REVIVE_REFUNDED_PAYMENT",
} as const;

export type OrderConflictCode =
  (typeof ORDER_CONFLICT_CODE)[keyof typeof ORDER_CONFLICT_CODE];

/**
 * The narrow shape we read off a rejected request.
 *
 * Structural rather than `AxiosError`: the only fields that matter are the
 * status and the coded body, and typing it this way keeps the helper a pure
 * function that a test can call with a literal.
 */
export interface ApiErrorLike {
  response?: {
    status?: number;
    data?: { error?: string; message?: string } | unknown;
  };
}

/**
 * True when the request was refused because the order moved under the operator
 * — either a forbidden transition or a lost update.
 *
 * Keyed off the HTTP status ALONE; the code only refines which conflict it was
 * (TASK-622). `HttpExceptionFilter` puts an `error` field in EVERY body — for an
 * uncoded exception it is the class name, `Forbidden` or `Internal Server
 * Error` — so "the body has a code" is true of any failure at all. Treating it
 * as evidence told an operator who had just lost `orders:write` that the order
 * had changed and to reload, which they did, forever. A 409 without a body (a
 * proxy swallowed it) is still a conflict.
 */
export function isOrderConflict(
  error: ApiErrorLike | null | undefined,
): boolean {
  return apiErrorStatus(error) === 409;
}

/**
 * The Ukrainian sentence for a rejected status write, or `null` when the failure
 * was not a conflict at all (network, 500, 403) and the caller should fall back
 * to its generic message.
 *
 * A 409 whose code we do not recognise still gets a conflict sentence — the one
 * thing that is certainly true of any 409 here is that the operator's change did
 * not land and the screen is out of date.
 */
export function orderConflictMessage(
  error: ApiErrorLike | null | undefined,
): string | null {
  if (!isOrderConflict(error)) {
    return null;
  }

  const code = apiErrorCode(error);
  if (code === ORDER_CONFLICT_CODE.STALE) {
    return dict.orderStatus.conflict.ORDER_STALE;
  }
  if (code === ORDER_CONFLICT_CODE.TRANSITION_INVALID) {
    return dict.orderStatus.conflict.ORDER_TRANSITION_INVALID;
  }
  if (code === ORDER_CONFLICT_CODE.REVIVE_REFUNDED_PAYMENT) {
    return dict.orderStatus.conflict.ORDER_REVIVE_REFUNDED_PAYMENT;
  }
  return dict.orderStatus.conflictUnknown;
}

/**
 * Whether the operator's screen is now definitely behind the server and the
 * honest instruction is "reload".
 *
 * True for STALE and for an uncoded 409. Deliberately FALSE for
 * TRANSITION_INVALID: that one is repaired by refetching the option list, which
 * the picker does automatically, so telling the operator to reload the page
 * would be busywork.
 *
 * FALSE for REVIVE_REFUNDED_PAYMENT too, and for a stronger reason: nothing is
 * out of date there. The refusal is about what the order IS, not about what the
 * screen knows, and reloading would show the operator the same order and the
 * same refusal (review of plan 180).
 */
const NO_RELOAD_CODES: readonly string[] = [
  ORDER_CONFLICT_CODE.TRANSITION_INVALID,
  ORDER_CONFLICT_CODE.REVIVE_REFUNDED_PAYMENT,
];

export function requiresReload(
  error: ApiErrorLike | null | undefined,
): boolean {
  if (!isOrderConflict(error)) {
    return false;
  }
  const code = apiErrorCode(error);
  return code === undefined || !NO_RELOAD_CODES.includes(code);
}

/**
 * What an operator reads when an order write is refused: the conflict sentence
 * for a 409, «немає права» for a 403, `null` for anything else so the caller
 * falls back to its own generic copy (TASK-622).
 *
 * The 403 is named rather than folded into the generic failure because the two
 * have opposite remedies: "try again" is useless without the grant, and the
 * operator needs to know that asking the owner — not reloading — is the fix.
 */
export function orderWriteErrorMessage(
  error: ApiErrorLike | null | undefined,
): string | null {
  if (apiErrorStatus(error) === 403) {
    return dict.orderStatus.forbidden;
  }
  return orderConflictMessage(error);
}
