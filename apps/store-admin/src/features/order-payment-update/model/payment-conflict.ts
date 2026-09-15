import { dict } from "@/shared/config";

/**
 * Decoding the 409s the payment endpoint raises, into something an operator can
 * act on (TASK-431).
 *
 * The codes mirror `apps/store-api/src/order/order.errors.ts` and are the
 * contract — stable, so the wording can be reworked without touching the server.
 * The wording itself is ours: the backend messages are English, written for a
 * log, and one of them names both ends of a transition nobody asked about.
 *
 * Deliberately a twin of `order-status-update/model/order-conflict.ts` rather
 * than an import of it: a feature must not import another feature (FSD), and the
 * two sets of codes have nothing in common but their shape.
 */
export const PAYMENT_CONFLICT_CODE = {
  /** The payment state machine forbids this move. */
  TRANSITION_INVALID: "ORDER_PAYMENT_TRANSITION_INVALID",
  /** A full refund was asked for while the order is still live. */
  REFUND_REQUIRES_CLOSED_ORDER: "ORDER_REFUND_REQUIRES_CLOSED_ORDER",
} as const;

/**
 * The narrow shape read off a rejected request — structural rather than
 * `AxiosError`, so a test can call this with a literal.
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
 * The Ukrainian sentence for a rejected payment write, or `null` when the
 * failure was not a conflict at all (network, 500, 403) and the caller should
 * fall back to its generic message.
 *
 * A 409 whose code we do not recognise still gets a conflict sentence: the one
 * thing certainly true of any 409 here is that the change did not land and the
 * screen is out of date.
 */
export function paymentConflictMessage(
  error: ApiErrorLike | null | undefined,
): string | null {
  const code = codeOf(error);
  const isConflict = error?.response?.status === 409 || code !== undefined;

  if (!isConflict) {
    return null;
  }

  if (code === PAYMENT_CONFLICT_CODE.TRANSITION_INVALID) {
    return dict.orderStatus.conflict.ORDER_PAYMENT_TRANSITION_INVALID;
  }
  if (code === PAYMENT_CONFLICT_CODE.REFUND_REQUIRES_CLOSED_ORDER) {
    return dict.orderStatus.conflict.ORDER_REFUND_REQUIRES_CLOSED_ORDER;
  }
  return dict.orderStatus.conflictUnknown;
}
