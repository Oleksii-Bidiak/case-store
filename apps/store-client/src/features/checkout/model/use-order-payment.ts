"use client";

import { useCallback, useState } from "react";
import { usePaymentControllerCreateCheckout } from "@/entities/payment";
import { dict } from "@/shared/config";
import { submitPaymentHandoff } from "../lib/payment-handoff";
import { rememberPaymentAttempt } from "../lib/payment-attempt";

/**
 * Why a handoff could not be started. Each maps to copy that describes the
 * *order*, never the money — a failed handoff means no payment was attempted,
 * so there is nothing to be uncertain about.
 */
export type PaymentStartFailure =
  | "unavailable" // 503 — provider not configured
  | "account" //     401 — the endpoint requires a session
  | "conflict" //    409 — already paid, or no longer payable
  | "generic";

export interface UseOrderPaymentResult {
  /**
   * Open a payment attempt for `orderId` and hand the browser to the provider.
   *
   * Resolves to `null` on success — by then the browser is already navigating
   * away — and to the reason on failure.
   */
  startPayment: (orderId: string) => Promise<PaymentStartFailure | null>;
  isStarting: boolean;
  failure: PaymentStartFailure | null;
  reset: () => void;
}

function classify(status: number | undefined): PaymentStartFailure {
  if (status === 503) return "unavailable";
  if (status === 401 || status === 403) return "account";
  if (status === 409) return "conflict";
  return "generic";
}

/**
 * useOrderPayment — start (or restart) an online payment for an existing order.
 *
 * **Every call opens a NEW payment attempt, and that is the point.** The provider
 * refuses a second payment under an identifier it has already seen, so retrying a
 * declined card cannot mean "resend the old handoff" — it means asking the server
 * for a fresh `Payment` with a fresh id (docs/payments-liqpay.md §3, step 9).
 * Nothing here caches or reuses a previous response; the mutation is fired again
 * and the returned fields are submitted as they arrive.
 *
 * Shared by checkout (first attempt) and the confirmation page (retry) so both go
 * through the same code and cannot drift into different behaviour.
 */
export function useOrderPayment(): UseOrderPaymentResult {
  const [failure, setFailure] = useState<PaymentStartFailure | null>(null);
  const mutation = usePaymentControllerCreateCheckout();

  const startPayment = useCallback(
    async (orderId: string): Promise<PaymentStartFailure | null> => {
      setFailure(null);
      try {
        const response = await mutation.mutateAsync({ orderId });
        const handoff = response?.data;

        if (!handoff?.url || !handoff.fields) {
          setFailure("generic");
          return "generic";
        }

        // Written before the navigation, not after: once `submit()` runs the
        // page is on its way out and nothing further of ours will execute.
        rememberPaymentAttempt(orderId, handoff.paymentId);
        submitPaymentHandoff(handoff);
        return null;
      } catch (error) {
        const status = (error as { response?: { status?: number } } | undefined)
          ?.response?.status;
        const reason = classify(status);
        setFailure(reason);
        return reason;
      }
    },
    [mutation],
  );

  return {
    startPayment,
    isStarting: mutation.isPending,
    failure,
    reset: useCallback(() => setFailure(null), []),
  };
}

/** Copy for a handoff failure raised while placing an order. */
export function checkoutHandoffMessage(failure: PaymentStartFailure): string {
  const copy = dict.checkout.payment;
  if (failure === "unavailable") return copy.errorUnavailable;
  if (failure === "account") return copy.errorAccount;
  if (failure === "conflict") return copy.errorConflict;
  return copy.errorGeneric;
}

/** Copy for a handoff failure raised while retrying from the order page. */
export function retryHandoffMessage(failure: PaymentStartFailure): string {
  const copy = dict.order.payment;
  if (failure === "unavailable") return copy.retryUnavailable;
  if (failure === "conflict") return copy.retryConflict;
  return copy.retryGeneric;
}
