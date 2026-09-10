"use client";

import { useEffect } from "react";
import type { UseFormReset } from "react-hook-form";
import { useUserControllerGetProfile } from "@/entities/user";
import {
  CHECKOUT_DEFAULT_VALUES,
  type CheckoutFormValues,
} from "./checkout-schema";

/**
 * useCheckoutPrefill — seed the checkout form with the logged-in user's saved
 * contact details (`firstName`, `lastName`, `phone`) from their profile.
 *
 * The profile is fetched via `useUserControllerGetProfile`, gated on
 * `isAuthenticated` so it never fires for guests. When the profile arrives the
 * form is seeded with `reset()` inside a `useEffect` keyed to the user identity.
 *
 * Form-sync compliance (`docs/conventions/forms.md`, Rule 2b):
 *   - We never seed `useState`/`defaultValues` from this async data.
 *   - `reset()` runs only when `user?.id` becomes truthy and re-runs only when
 *     the identity changes — not on every background refetch.
 *   - `{ keepDirtyValues: true }` preserves any field the user has already
 *     edited, so in-progress input typed before the profile loads is not
 *     clobbered.
 *
 * `city`, `deliveryAddress`, and `notes` have no profile source and are reset to
 * empty strings (delivery prefill is deferred to the Nova Poshta work, TASK-080).
 *
 * @param reset - the `reset` function from the checkout `useForm` instance.
 * @param isAuthenticated - whether the current visitor is signed in.
 */
export function useCheckoutPrefill(
  reset: UseFormReset<CheckoutFormValues>,
  isAuthenticated: boolean,
): void {
  const { data } = useUserControllerGetProfile({
    query: { enabled: isAuthenticated },
  });
  const user = data?.data;

  useEffect(() => {
    if (!user?.id) return;
    reset(
      {
        // `reset` replaces the entire form value, so any field it omits becomes
        // undefined. Restating the static defaults keeps the payment radio from
        // silently losing its selection the moment the profile lands;
        // `keepDirtyValues` still protects a choice the shopper already made.
        //
        // Spread FIRST, so what we know about this user wins over the blank
        // default. It used to come last, which was harmless only for as long as
        // the defaults and the profile fields did not overlap — the moment
        // `phone: ""` joined the defaults (TASK-407) that ordering would have
        // wiped the saved number out of every prefilled checkout.
        ...CHECKOUT_DEFAULT_VALUES,
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        phone: user.phone ?? "",
        city: "",
        npCityRef: "",
        deliveryAddress: "",
        npWarehouseRef: "",
        notes: "",
      },
      { keepDirtyValues: true },
    );
    // Only re-seed when the user identity changes (Rule 2b, forms.md); the other
    // values referenced here are intentionally excluded from the dep array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
}
