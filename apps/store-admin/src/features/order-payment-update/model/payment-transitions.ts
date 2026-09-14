import type { AdminOrderAllowedPaymentTransitionsResponse } from "@/entities/order";

/**
 * What the payment picker needs in order to offer a legal move — read from the
 * server, never derived here (TASK-431).
 *
 * The sibling of `order-status-update/model/transitions.ts`, and deliberately a
 * SEPARATE file rather than a shared generic: the two lists come from two
 * different enums, and a feature importing another feature's model would break
 * the FSD import direction for the sake of six lines.
 *
 * Why the client does not compute this itself: until TASK-431 it did — the
 * select offered `Object.values(PaymentStatus)` minus the current one, on the
 * assumption that an operator would only pick sensible things. Nothing on the
 * server disagreed, so "REFUNDED" sat there on a delivered order looking like a
 * decision they were allowed to make. The rules now live in
 * `order-state-machine.ts`, and a second copy here would be a copy that drifts.
 *
 * An EMPTY `allowed` is a real answer, not a failure: from REFUNDED there is
 * nowhere left to go.
 */
export interface PaymentTransitionOptions {
  /** Payment statuses the order may legally move to right now. Possibly empty. */
  readonly allowed: string[];
  /** The order's current payment status, as the server reported it. */
  readonly current: string | undefined;
}

const NO_OPTIONS: PaymentTransitionOptions = {
  allowed: [],
  current: undefined,
};

/**
 * Unwrap the allowed-payment-transitions envelope into what the picker renders.
 *
 * Returns an empty option set — never a guessed one — while the read is in
 * flight or has failed. An empty picker is honest about not knowing; a full one
 * would invite the operator to choose something the server is about to refuse.
 */
export function toPaymentTransitionOptions(
  response: AdminOrderAllowedPaymentTransitionsResponse | undefined,
): PaymentTransitionOptions {
  if (!response?.data) {
    return NO_OPTIONS;
  }

  return {
    allowed: [...response.data.allowed],
    current: response.data.current,
  };
}
