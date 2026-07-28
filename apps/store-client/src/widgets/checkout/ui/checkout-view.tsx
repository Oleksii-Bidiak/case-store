"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/entities/session";
import { useGetCart } from "@/entities/cart";
import {
  CheckoutAddressForm,
  CheckoutContactFields,
  CheckoutReviewStep,
  useCheckout,
  useCheckoutPrefill,
  useCheckoutSteps,
  checkoutSchemaFor,
  readConfiguredMethods,
  resolvePaymentMethods,
  CHECKOUT_DEFAULT_VALUES,
  type CheckoutFormValues,
} from "@/features/checkout";
import { Button, CheckoutSkeleton, Textarea } from "@/shared/ui";
import { dict, STICKY_ASIDE_TOP } from "@/shared/config";
import { trackEvent } from "@/shared/lib";
import { CheckoutOrderSummary } from "./checkout-order-summary";
import { CheckoutStepIndicator } from "./checkout-step-indicator";
import { CheckoutPayment } from "./checkout-payment";
import { CheckoutGuestSuccess } from "./checkout-guest-success";

/**
 * CheckoutView — client orchestrator for the `/checkout` route.
 *
 * Guards in order:
 *   1. While the silent auth refresh is in-flight, render a skeleton — otherwise
 *      a signed-in shopper flashes the guest form for a frame.
 *   2. Empty cart → redirect back to `/cart`.
 *   3. Otherwise render the form.
 *
 * ── No login wall (TASK-338) ──────────────────────────────────────────────────
 * This component used to redirect anyone without a session to
 * `/login?redirect=/checkout`, which made the storefront's own "замовлення без
 * реєстрації" promise (plan 102 §5) untrue for as long as it stood.
 * `POST /api/orders` no longer requires a JWT — a guest is identified by the same
 * cart cookie that owns the basket being converted — so the barrier is gone. A
 * guest fills one extra field (email) and is offered an account *after* the
 * order, never in front of it.
 *
 * The two shoppers diverge only at the end: a signed-in one is pushed to
 * `/orders/[id]/confirmation`; a guest gets {@link CheckoutGuestSuccess} in
 * place, because that route reads an endpoint guests cannot call.
 */
export function CheckoutView() {
  const router = useRouter();
  const { isAuthenticated, isInitializing } = useAuth();
  const isGuest = !isAuthenticated;

  // The cart is cookie-backed for guests, so it loads for everyone — gated only
  // on the auth probe having settled, exactly like the header cart badge.
  const { data, isLoading: isCartLoading } = useGetCart({
    query: { enabled: !isInitializing },
  });

  const {
    submitOrder,
    isPending,
    isError,
    errorMessage,
    isOrderSubmitted,
    placedOrder,
    handoffMessage,
  } = useCheckout({ isGuest });

  // Which payment methods this deployment offers, narrowed to what THIS shopper
  // can actually complete. Recomputed when the session settles: the online
  // options need an account, the payment endpoint being behind a JWT guard.
  const paymentOptions = useMemo(
    () =>
      resolvePaymentMethods({
        configured: readConfiguredMethods(),
        isAuthenticated,
      }),
    [isAuthenticated],
  );

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
    // Guests validate one extra field. RHF reassigns `control._options` on every
    // render, so swapping the resolver once the auth probe settles takes effect.
    resolver: zodResolver(checkoutSchemaFor(isGuest)),
    defaultValues: CHECKOUT_DEFAULT_VALUES,
  });

  // Seed the form with the logged-in user's saved contact details (name + phone).
  useCheckoutPrefill(reset, isAuthenticated);

  // Two-screen flow: Delivery (step 1) → Review (step 2). The order is created
  // only on the step-2 submit (TASK-146).
  const { step, isValidating, goToReview, goToDelivery } = useCheckoutSteps(
    trigger,
    isGuest,
  );
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
  const guestEmail = useWatch({ control, name: "email" }) ?? "";

  // Surface a blocked submit instead of failing silently: focus the first
  // invalid field so the user sees exactly what needs fixing.
  const focusFirstError = (formErrors: FieldErrors<CheckoutFormValues>) => {
    const first = Object.keys(formErrors)[0] as
      keyof CheckoutFormValues | undefined;
    if (first) setFocus(first);
  };

  const items = data?.data?.items ?? [];
  const cartIsEmpty = !isInitializing && !isCartLoading && items.length === 0;

  // Analytics: report checkout start (funnel step 3) exactly once, after the
  // empty-cart guard has passed and the cart has loaded with ≥1 item. The ref
  // guard keeps it from re-firing on later re-renders (e.g. form edits).
  const beginCheckoutTracked = useRef(false);
  useEffect(() => {
    if (beginCheckoutTracked.current) return;
    if (!isInitializing && !isCartLoading && items.length > 0) {
      beginCheckoutTracked.current = true;
      trackEvent("begin_checkout", { itemCount: items.length });
    }
  }, [isInitializing, isCartLoading, items.length]);

  // Redirect to the cart when there is nothing to order — but NOT right after a
  // successful order, when the backend empties the cart on purpose and we are
  // either navigating to the confirmation page or already showing the guest
  // success panel (the TASK-119 redirect race).
  useEffect(() => {
    if (cartIsEmpty && !isOrderSubmitted) {
      router.replace("/cart");
    }
  }, [cartIsEmpty, isOrderSubmitted, router]);

  // A guest's order is placed and there is nowhere to send them — render the
  // outcome here. Checked before the loading guards below, whose empty-cart
  // branch would otherwise swallow it.
  if (placedOrder) {
    return (
      <CheckoutGuestSuccess
        order={placedOrder}
        email={guestEmail.trim()}
        handoffMessage={handoffMessage}
      />
    );
  }

  if (isInitializing || isCartLoading || (cartIsEmpty && !isOrderSubmitted)) {
    return <CheckoutSkeleton />;
  }

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">
        {dict.checkout.title}
      </h1>

      <CheckoutStepIndicator current={step} />

      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- fixed+fluid column layout has no named grid-cols-N equivalent */}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
        <form
          onSubmit={handleSubmit(submitOrder, focusFirstError)}
          className="flex min-w-0 flex-col gap-4"
          noValidate
        >
          {step === 1 && (
            <>
              {isGuest && (
                // eslint-disable-next-line tailwindcss/no-arbitrary-value -- matches the grandfathered checkout card radius used by every sibling section below
                <section className="rounded-[18px] border border-border bg-card p-6 shadow-card">
                  <CheckoutContactFields register={register} errors={errors} />
                </section>
              )}

              <section className="rounded-[18px] border border-border bg-card p-6 shadow-card">
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
                    aria-invalid={errors.notes ? true : undefined}
                    aria-describedby={
                      errors.notes ? "checkout-notes-error" : undefined
                    }
                    {...register("notes")}
                  />
                  <span className="self-end text-xs text-muted-foreground">
                    {notes.length}/500
                  </span>
                  {errors.notes && (
                    <p
                      id="checkout-notes-error"
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {errors.notes.message}
                    </p>
                  )}
                </div>
              </section>

              <CheckoutPayment control={control} options={paymentOptions} />

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
              <section className="rounded-[18px] border border-border bg-card p-6 shadow-card">
                <CheckoutReviewStep ref={reviewHeadingRef} control={control} />
              </section>

              {isError && errorMessage && (
                <p role="alert" className="text-sm text-destructive">
                  {errorMessage}
                </p>
              )}

              {/* The order exists but the provider handoff never started. Speaks
                  about the handoff — never about the money. */}
              {handoffMessage && (
                <p role="alert" className="text-sm text-destructive">
                  {handoffMessage}
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

        {/* STICKY_ASIDE_TOP clears the z-50 site header so the stuck summary
            never sits under it (TASK-206 / TASK-234). */}
        <aside className={`lg:sticky ${STICKY_ASIDE_TOP}`}>
          <CheckoutOrderSummary npCityRef={npCityRef} />
        </aside>
      </div>
    </div>
  );
}
