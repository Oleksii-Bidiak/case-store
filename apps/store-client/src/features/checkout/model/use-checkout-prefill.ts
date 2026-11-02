"use client";

import { useEffect } from "react";
import type { UseFormGetValues, UseFormReset } from "react-hook-form";
import { useUserControllerGetProfile } from "@/entities/user";
import {
  CHECKOUT_DEFAULT_VALUES,
  type CheckoutFormValues,
} from "./checkout-schema";

const isBlank = (value: string | undefined) => !(value ?? "").trim();

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
 * ── Signing in mid-checkout (TASK-2010) ──────────────────────────────────────
 * A guest may now sign in from the contact block with half the form filled.
 * `keepDirtyValues` alone does not protect that: a value set from code — the
 * Nova Poshta city ref, the warehouse, the delivery method, a preselected
 * pickup point — is never dirty, and blank defaults would wipe it. So the
 * reset starts from the form's CURRENT values, and the profile only fills a
 * name or phone the shopper has left empty. On a fresh page load the current
 * values are the static defaults, which is exactly what this used to reset to.
 *
 * @param reset - the `reset` function from the checkout `useForm` instance.
 * @param getValues - its `getValues`, read when the profile lands.
 * @param isAuthenticated - whether the current visitor is signed in.
 */
export function useCheckoutPrefill(
  reset: UseFormReset<CheckoutFormValues>,
  getValues: UseFormGetValues<CheckoutFormValues>,
  isAuthenticated: boolean,
): void {
  const { data } = useUserControllerGetProfile({
    query: { enabled: isAuthenticated },
  });
  const user = data?.data;

  useEffect(() => {
    if (!user?.id) return;
    // `reset` replaces the entire form value, so any field it omits becomes
    // undefined. The static defaults go first, the live values over them (a
    // field RHF has never seen still gets its default — forms.md Rule 4c).
    const current = { ...CHECKOUT_DEFAULT_VALUES, ...getValues() };
    reset(
      {
        ...current,
        firstName: isBlank(current.firstName)
          ? (user.firstName ?? "")
          : current.firstName,
        lastName: isBlank(current.lastName)
          ? (user.lastName ?? "")
          : current.lastName,
        // A phone field holding only the «+380» prefix is still empty.
        phone:
          (current.phone ?? "").replace(/\D/g, "").length <= 3
            ? (user.phone ?? "")
            : current.phone,
      },
      { keepDirtyValues: true },
    );
    // Only re-seed when the user identity changes (Rule 2b, forms.md); the other
    // values referenced here are intentionally excluded from the dep array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
}
