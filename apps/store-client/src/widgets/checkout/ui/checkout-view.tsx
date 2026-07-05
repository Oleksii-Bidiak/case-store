"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/entities/session";
import { useGetCart } from "@/entities/cart";
import {
  CheckoutAddressForm,
  CheckoutReviewStep,
  useCheckout,
  useCheckoutPrefill,
  useCheckoutSteps,
  checkoutSchema,
  type CheckoutFormValues,
} from "@/features/checkout";
import { Button, CheckoutSkeleton, Textarea } from "@/shared/ui";
import { dict } from "@/shared/config";
import { CheckoutOrderSummary } from "./checkout-order-summary";
import { CheckoutStepIndicator } from "./checkout-step-indicator";
import { CheckoutPaymentStub } from "./checkout-payment-stub";

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
    trigger,
    formState: { errors },
  } = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
  });

  // Seed the form with the logged-in user's saved contact details (name + phone).
  useCheckoutPrefill(reset, isAuthenticated);

  // Two-screen flow: Delivery (step 1) → Review (step 2). The order is created
  // only on the step-2 submit (TASK-146).
  const { step, isValidating, goToReview, goToDelivery } =
    useCheckoutSteps(trigger);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const isFirstRender = useRef(true);

  // Move focus on step transitions (not on initial mount): to the review heading
  // when advancing, back to the first field when returning (WCAG 2.4.3).
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (step === 2) reviewHeadingRef.current?.focus();
    else setFocus("firstName");
  }, [step, setFocus]);

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
    <div>
      <h1 className="mb-6 font-display text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">
        {dict.checkout.title}
      </h1>

      <CheckoutStepIndicator current={step} />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
        <form
          onSubmit={handleSubmit(submitOrder, focusFirstError)}
          className="flex min-w-0 flex-col gap-4"
          noValidate
        >
          {step === 1 && (
            <>
              <section className="rounded-[18px] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
                <CheckoutAddressForm
                  legend={dict.checkout.shippingAddress}
                  register={register}
                  control={control}
                  setValue={setValue}
                  errors={errors}
                />

                <div className="mt-4 flex flex-col gap-1">
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
              </section>

              <CheckoutPaymentStub />

              <Button
                type="button"
                size="lg"
                onClick={goToReview}
                disabled={isValidating}
                className="self-start"
              >
                {dict.checkout.nextStep}
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <section className="rounded-[18px] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
                <CheckoutReviewStep ref={reviewHeadingRef} control={control} />
              </section>

              {isError && errorMessage && (
                <p role="alert" className="text-sm text-destructive">
                  {errorMessage}
                </p>
              )}

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  onClick={goToDelivery}
                >
                  {dict.checkout.prevStep}
                </Button>
                <Button type="submit" size="lg" disabled={isPending}>
                  {isPending
                    ? dict.checkout.placingOrder
                    : dict.checkout.placeOrder}
                </Button>
              </div>
            </>
          )}
        </form>

        {/* top-24 = sticky header (h-16) + gap — same offset convention as the
            catalog filters / wishlist asides, so the stuck summary never sits
            under the z-50 site header (TASK-206). */}
        <aside className="lg:sticky lg:top-24">
          <CheckoutOrderSummary npCityRef={npCityRef} />
        </aside>
      </div>
    </div>
  );
}
