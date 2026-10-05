"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  forgetPaymentAttempt,
  readPaymentAttempt,
} from "../lib/payment-attempt";

/**
 * How long to keep asking the server whether the payment callback has landed,
 * measured from the moment this browser was handed off to the provider.
 *
 * Long enough to cover a 3-D Secure detour and a provider retry; short enough
 * that a shopper whose callback never arrives is told so plainly instead of
 * watching a spinner indefinitely. Past this window the reconciliation cron is
 * the safety net — not the shopper's patience.
 */
export const CALLBACK_WAIT_MS = 3 * 60 * 1000;
export const CALLBACK_POLL_MS = 4000;

/** The slice of a react-query `Query` the poll predicate reads. */
interface OrderQueryLike {
  state: { data?: { data?: { paymentStatus?: string } | null } };
}

export interface PaymentAttemptWatch {
  /** This browser went off to pay for this order recently (local, forgeable). */
  hasRecentAttempt: boolean;
  /** Still inside the wait window — keep saying «Підтверджуємо вашу оплату». */
  isAwaitingCallback: boolean;
  /** `refetchInterval` for `useGetOrder`: poll while it is worth it. */
  refetchInterval: (query: OrderQueryLike) => number | false;
}

/**
 * The payment-callback wait of an order screen (TASK-330-B), shared by the
 * checkout confirmation page and the account order detail (TASK-217) so the two
 * cannot drift.
 *
 * Did THIS browser just go off to pay for THIS order? Read once per order id.
 * It is session-local and forgeable, so it may influence wording and polling
 * and nothing else — every statement about money comes from `paymentStatus`.
 *
 * Whether the wait window has run out is held in state and flipped by a timer
 * rather than compared against `Date.now()` during render: a render-time clock
 * read is impure, and it would only ever change when something unrelated
 * re-rendered, so a shopper staring at the page could sit on "confirming…" long
 * past the point where we know better.
 */
export function usePaymentAttemptWatch(orderId: string): PaymentAttemptWatch {
  const attempt = useMemo(() => readPaymentAttempt(orderId), [orderId]);
  const callbackDeadline = attempt ? attempt.startedAt + CALLBACK_WAIT_MS : 0;

  const [waitElapsed, setWaitElapsed] = useState(false);
  useEffect(() => {
    if (!attempt) return;
    // Clamped rather than branched: an already-expired attempt schedules a
    // zero-delay timer instead of setting state synchronously inside the
    // effect, which would cascade an extra render for no benefit.
    const remaining = Math.max(0, callbackDeadline - Date.now());
    const timer = setTimeout(() => setWaitElapsed(true), remaining);
    return () => clearTimeout(timer);
  }, [attempt, callbackDeadline]);

  // Poll only while there is a real reason to: this browser paid, the server
  // still says PENDING, and we are inside the wait window. The predicate reads
  // the freshest cached order, so the first non-PENDING response stops the loop
  // by itself.
  const refetchInterval = useCallback(
    (query: OrderQueryLike): number | false => {
      if (!attempt) return false;
      if (query.state.data?.data?.paymentStatus !== "PENDING") return false;
      if (Date.now() > callbackDeadline) return false;
      return CALLBACK_POLL_MS;
    },
    [attempt, callbackDeadline],
  );

  return {
    hasRecentAttempt: !!attempt,
    isAwaitingCallback: !!attempt && !waitElapsed,
    refetchInterval,
  };
}

/**
 * Once the payment reaches a settled state the attempt note has done its job.
 * Clearing it stops a later visit from re-entering the "confirming" copy.
 */
export function useForgetSettledPaymentAttempt(
  orderId: string,
  paymentStatus: string | undefined,
): void {
  useEffect(() => {
    if (paymentStatus && paymentStatus !== "PENDING") {
      forgetPaymentAttempt(orderId);
    }
  }, [paymentStatus, orderId]);
}
