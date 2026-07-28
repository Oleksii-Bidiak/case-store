"use client";

import { useCallback, useState } from "react";
import type { UseFormTrigger } from "react-hook-form";
import type { CheckoutFormValues } from "./checkout-schema";

/**
 * Delivery-step fields that must validate before advancing to the review step.
 * `npCityRef`/`npWarehouseRef` are excluded — both are `.optional()` and set
 * automatically by the Nova Poshta autocomplete, never typed by the user.
 */
export const DELIVERY_STEP_FIELDS = [
  "firstName",
  "lastName",
  "phone",
  "city",
  "deliveryAddress",
  "notes",
] as const satisfies readonly (keyof CheckoutFormValues)[];

/**
 * Extra step-1 field for a shopper without an account (TASK-338). Validated here
 * rather than only at submit, so a guest hears about a missing email on the
 * screen that holds the input instead of two screens later.
 */
export const GUEST_STEP_FIELDS = [
  "email",
] as const satisfies readonly (keyof CheckoutFormValues)[];

export interface CheckoutSteps {
  /** Current step: 1 = Delivery, 2 = Review. */
  step: 1 | 2;
  /** True while the delivery fields are being validated (gates the "Далі" button). */
  isValidating: boolean;
  /** Validate the delivery fields and advance to review only if they pass. */
  goToReview: () => Promise<void>;
  /** Return to the delivery step. */
  goToDelivery: () => void;
}

/**
 * useCheckoutSteps — transient step state for the two-screen checkout flow
 * (Delivery → Review). The single `useForm` instance is owned by `CheckoutView`;
 * this hook only gates the transition by running `trigger` on the delivery
 * fields, so the order-creation submit stays behind the review screen (TASK-146).
 */
export function useCheckoutSteps(
  trigger: UseFormTrigger<CheckoutFormValues>,
  isGuest = false,
): CheckoutSteps {
  const [step, setStep] = useState<1 | 2>(1);
  const [isValidating, setIsValidating] = useState(false);

  const goToReview = useCallback(async () => {
    setIsValidating(true);
    try {
      const fields = isGuest
        ? [...DELIVERY_STEP_FIELDS, ...GUEST_STEP_FIELDS]
        : [...DELIVERY_STEP_FIELDS];
      const valid = await trigger(fields);
      if (valid) setStep(2);
    } finally {
      setIsValidating(false);
    }
  }, [trigger, isGuest]);

  const goToDelivery = useCallback(() => setStep(1), []);

  return { step, isValidating, goToReview, goToDelivery };
}
