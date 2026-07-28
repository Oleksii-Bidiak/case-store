import { dict } from "@/shared/config";

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

function codeOf(error: ApiErrorLike | null | undefined): string | undefined {
  const data = error?.response?.data;
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const code = (data as { error?: unknown }).error;
  return typeof code === "string" ? code : undefined;
}

/**
 * True when the request was refused because the order moved under the operator
 * — either a forbidden transition or a lost update.
 *
 * Keyed off the HTTP status OR the code, not the code alone: a proxy that
 * swallows the body still leaves a 409, and "someone else changed this" is a far
 * better guess at that point than "unknown error".
 */
export function isOrderConflict(
  error: ApiErrorLike | null | undefined,
): boolean {
  return error?.response?.status === 409 || codeOf(error) !== undefined;
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

  const code = codeOf(error);
  if (code === ORDER_CONFLICT_CODE.STALE) {
    return dict.orderStatus.conflict.ORDER_STALE;
  }
  if (code === ORDER_CONFLICT_CODE.TRANSITION_INVALID) {
    return dict.orderStatus.conflict.ORDER_TRANSITION_INVALID;
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
 */
export function requiresReload(
  error: ApiErrorLike | null | undefined,
): boolean {
  if (!isOrderConflict(error)) {
    return false;
  }
  return codeOf(error) !== ORDER_CONFLICT_CODE.TRANSITION_INVALID;
}
