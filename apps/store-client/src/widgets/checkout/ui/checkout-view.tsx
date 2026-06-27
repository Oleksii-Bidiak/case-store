"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/entities/session";
import { useGetCart } from "@/entities/cart";
import {
  CheckoutAddressForm,
  useCheckout,
  useCheckoutPrefill,
  checkoutSchema,
  type CheckoutFormValues,
} from "@/features/checkout";
import { Button, CheckoutSkeleton, Textarea } from "@/shared/ui";
import { dict } from "@/shared/config";
import { CheckoutOrderSummary } from "./checkout-order-summary";
import { CheckoutStepIndicator } from "./checkout-step-indicator";

/**
 * CheckoutView — client orchestrator for the `/checkout` route.
 *
 * Guards in order:
 *   1. While the silent auth refresh is in-flight, render a skeleton (avoids a
 *      flash-redirect to login for users who are actually signed in).
 *   2. Unauthenticated → redirect to `/login?redirect=/checkout` (the backend
 *      `POST /api/orders` requires a JWT).
 *   3. Authenticated but empty cart → redirect back to `/cart`.
 *   4. Otherwise render the address form + order summary.
 */
export function CheckoutView() {
  const router = useRouter();
  const { isAuthenticated, isInitializing } = useAuth();

  const { data, isLoading: isCartLoading } = useGetCart({
    query: { enabled: isAuthenticated },
  });

  const { submitOrder, isPending, isError, errorMessage, isOrderSubmitted } =
    useCheckout();

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    setFocus,
    formState: { errors },
  } = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
  });

  // Seed the form with the logged-in user's saved contact details (name + phone).
  useCheckoutPrefill(reset, isAuthenticated);

  const notes = useWatch({ control, name: "notes" }) ?? "";
  // Drives the live Nova Poshta shipping estimate in the order summary (TASK-080).
  const npCityRef = useWatch({ control, name: "npCityRef" });

  // Surface a blocked submit instead of failing silently: focus the first
  // invalid field so the user sees exactly what needs fixing.
  const focusFirstError = (formErrors: FieldErrors<CheckoutFormValues>) => {
    const first = Object.keys(formErrors)[0] as
      | keyof CheckoutFormValues
      | undefined;
    if (first) setFocus(first);
  };

  const items = data?.data?.items ?? [];
  const cartIsEmpty = isAuthenticated && !isCartLoading && items.length === 0;

  // Redirect unauthenticated visitors to login (once init has settled).
  useEffect(() => {
    if (!isInitializing && !isAuthenticated) {
      router.replace("/login?redirect=/checkout");
    }
  }, [isInitializing, isAuthenticated, router]);

  // Redirect to the cart when there is nothing to order — but NOT right after a
  // successful order, when the backend empties the cart on purpose and we are
  // already navigating to the confirmation page (the TASK-119 redirect race).
  useEffect(() => {
    if (cartIsEmpty && !isOrderSubmitted) {
      router.replace("/cart");
    }
  }, [cartIsEmpty, isOrderSubmitted, router]);

  if (
    isInitializing ||
    !isAuthenticated ||
    isCartLoading ||
    (cartIsEmpty && !isOrderSubmitted)
  ) {
    return <CheckoutSkeleton />;
  }

  return (
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-3">
      <section className="lg:col-span-2">
        <h1 className="mb-6 font-display text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          {dict.checkout.title}
        </h1>

        <CheckoutStepIndicator current={1} />

        <form
          onSubmit={handleSubmit(submitOrder, focusFirstError)}
          className="flex flex-col gap-8"
          noValidate
        >
          <CheckoutAddressForm
            legend={dict.checkout.shippingAddress}
            register={register}
            control={control}
            setValue={setValue}
            errors={errors}
          />

          <div className="flex flex-col gap-1">
            <label
              htmlFor="checkout-notes"
              className="text-sm font-medium text-foreground"
            >
              {dict.checkout.orderNotes}{" "}
              <span className="text-muted-foreground">
                {dict.common.optional}
              </span>
            </label>
            <Textarea
              id="checkout-notes"
              rows={3}
              maxLength={500}
              {...register("notes")}
            />
            <span className="self-end text-xs text-muted-foreground">
              {notes.length}/500
            </span>
            {errors.notes && (
              <p role="alert" className="text-sm text-destructive">
                {errors.notes.message}
              </p>
            )}
          </div>

          {isError && errorMessage && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            disabled={isPending}
            className="self-start"
          >
            {isPending ? dict.checkout.placingOrder : dict.checkout.placeOrder}
          </Button>
        </form>
      </section>

      <aside className="lg:col-span-1 lg:self-start">
        <CheckoutOrderSummary npCityRef={npCityRef} />
      </aside>
    </div>
  );
}
