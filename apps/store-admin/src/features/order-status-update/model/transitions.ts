import type { AdminOrderAllowedTransitionsResponse } from "@/entities/order";

/**
 * What the status picker needs in order to offer a legal move — read from the
 * server, never derived here.
 *
 * ── Why this file no longer computes anything ───────────────────────────────
 * It used to. TASK-151 removed the forward-only transition map and replaced it
 * with `ALL_STATUSES.filter(s => s !== current)` — every status except the
 * current one — on the reasoning that "transition sensibility is the admin's
 * responsibility". Nothing on the server disagreed, so that was true by default
 * rather than by design.
 *
 * TASK-332 made the server authoritative: `order-state-machine.ts` now refuses
 * an illegal move with 409, and `GET /api/admin/orders/:id/allowed-transitions`
 * publishes exactly what is legal right now. A second copy of those rules in the
 * client would be a copy that drifts — and every drift shows up as an operator
 * picking a status, waiting, and being told no. So the client asks.
 *
 * The response also carries `updatedAt`, and it is NOT decoration: it is the
 * optimistic-lock token handed straight back on the follow-up PATCH, which is
 * what turns "two admins on one order" from last-write-wins into a 409 the
 * second one can actually see (edge case E-11). Reading the token from the SAME
 * response as the options matters — a token taken from a separately-cached order
 * read could already be stale before the operator has clicked anything.
 */
export interface TransitionOptions {
  /** Statuses the order may legally move to right now. Possibly empty. */
  readonly allowed: string[];
  /**
   * The order's `updatedAt` as the server reported it alongside `allowed`.
   * Undefined only while the read is in flight or has failed.
   */
  readonly expectedUpdatedAt: string | undefined;
}

const NO_OPTIONS: TransitionOptions = {
  allowed: [],
  expectedUpdatedAt: undefined,
};

/**
 * Unwrap the allowed-transitions envelope into what the picker renders.
 *
 * Returns an empty option set — never a guessed one — when the read has not
 * landed. An empty picker is honest about not knowing; a full one would invite
 * the operator to choose something the server is about to refuse.
 */
export function toTransitionOptions(
  response: AdminOrderAllowedTransitionsResponse | undefined,
): TransitionOptions {
  if (!response?.data) {
    return NO_OPTIONS;
  }

  return {
    allowed: [...response.data.allowed],
    expectedUpdatedAt: response.data.updatedAt,
  };
}
