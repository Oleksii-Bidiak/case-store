"use client";

import { useCallback, useState } from "react";

export interface CheckoutSteps {
  /** Current step: 1 = Delivery, 2 = Review. */
  step: 1 | 2;
  /** Advance to the review step. */
  goToReview: () => void;
  /** Return to the delivery step. */
  goToDelivery: () => void;
}

/**
 * useCheckoutSteps — transient step state for the two-screen checkout flow
 * (Delivery → Review). Nothing else: the single `useForm` instance is owned by
 * `CheckoutView`, and the order-creation submit stays behind the review screen
 * (TASK-146).
 *
 * ── Why this hook no longer validates (TASK-407) ──────────────────────────────
 * It used to take RHF's `trigger` and run it over an explicit list of
 * delivery-step fields before advancing. That list was a second, hand-kept copy
 * of "what is on screen 1" — but the real cost was the timing: RHF arms
 * `reValidateMode` on SUBMIT, and a manual `trigger()` is not a submit, so every
 * message raised this way stayed on screen while the shopper fixed the field.
 * Step 1 is now a real `handleSubmit(goToReview)`, which validates the whole
 * form — every field of which lives on screen 1 except `paymentMethod`, and that
 * one always holds its default — and gets the correct timing for free.
 */
export function useCheckoutSteps(): CheckoutSteps {
  const [step, setStep] = useState<1 | 2>(1);

  const goToReview = useCallback(() => setStep(2), []);
  const goToDelivery = useCallback(() => setStep(1), []);

  return { step, goToReview, goToDelivery };
}
