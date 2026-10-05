"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type BaseSyntheticEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/entities/session";
import { useGetCart } from "@/entities/cart";
import {
  CheckoutAddressForm,
  CheckoutConsent,
  CheckoutContactFields,
  CheckoutReviewStep,
  useCheckout,
  useCheckoutPrefill,
  useCheckoutSteps,
  checkoutSchemaFor,
  coercePaymentMethod,
  readConfiguredMethods,
  resolvePaymentMethods,
  CHECKOUT_DEFAULT_VALUES,
  type CheckoutFormValues,
} from "@/features/checkout";
import {
  Button,
  CheckoutSkeleton,
  MobilePayBar,
  OrderTrustStrip,
  Textarea,
} from "@/shared/ui";
import { dict, STICKY_ASIDE_TOP, H1_CLASS } from "@/shared/config";
import { trackEvent } from "@/shared/lib";
import { useCheckoutTotal } from "../model/use-checkout-total";
import { CheckoutOrderSummary } from "./checkout-order-summary";
import { CheckoutStepIndicator } from "./checkout-step-indicator";
import { CheckoutPayment } from "./checkout-payment";
import { CheckoutGuestSuccess } from "./checkout-guest-success";

/**
 * The step's primary button: a full-width 44px thumb target with the CTA radius
 * in the mobile bar, the regular `size="lg"` button from md up (TASK-864).
 * Resolved through `cn()` inside `Button`, which knows the role radii.
 */
const MOBILE_BAR_CTA =
  "h-11 w-full rounded-cta font-bold md:h-10 md:w-auto md:self-start md:rounded-md md:font-medium";

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
    formState: { errors, isSubmitting },
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
  const { step, goToReview, goToDelivery } = useCheckoutSteps();
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const isFirstRender = useRef(true);
  // The invalid field a blocked step-2 submit sends the shopper back to — see
  // `focusFirstError`. Consumed by the step-transition effect below.
  const pendingErrorFocus = useRef<keyof CheckoutFormValues | null>(null);

  // Offer + privacy consent on the confirm step (TASK-882). Plain state, not a
  // form field: the zod schema also runs on the step-1 «Далі», where an
  // unticked box must not block. A blocked confirm sets `consentError` — the
  // message is shown, never a silently disabled button.
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const consentRef = useRef<HTMLInputElement>(null);

  // Move focus on step transitions (not on initial mount): to the review heading
  // when advancing, back to the first field when returning (WCAG 2.4.3) — or to
  // the invalid field when the return was forced by a blocked submit.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (step === 2) {
      reviewHeadingRef.current?.focus();
      return;
    }
    const target = pendingErrorFocus.current ?? "firstName";
    pendingErrorFocus.current = null;
    setFocus(target);
  }, [step, setFocus]);

  const notes = useWatch({ control, name: "notes" }) ?? "";
  // Drives the live Nova Poshta shipping estimate in the order summary (TASK-080).
  const npCityRef = useWatch({ control, name: "npCityRef" });
  const guestEmail = useWatch({ control, name: "email" }) ?? "";
  const paymentMethod = useWatch({ control, name: "paymentMethod" });

  // A session that expires mid-checkout (TASK-773) disables the online methods
  // under a choice already made. Nothing would then be checked, and the order
  // would go out as a guest with a method guests cannot complete — fall back to
  // the method this shopper can still use.
  useEffect(() => {
    const allowed = coercePaymentMethod(paymentMethod, paymentOptions);
    if (allowed !== paymentMethod) setValue("paymentMethod", allowed);
  }, [paymentMethod, paymentOptions, setValue]);

  // Surface a blocked submit instead of failing silently: focus the first
  // invalid field so the user sees exactly what needs fixing.
  //
  // Every field — and so every error message — lives on step 1; step 2 renders
  // none of them. Step 2 still validates the whole form, and it CAN fail there:
  // a session that expires on the review screen flips the resolver to the guest
  // schema, whose email is required (TASK-773/794). Focusing a field that is not
  // mounted does nothing, which left «Оформити» a silent button. So a blocked
  // step-2 submit goes back to step 1, where the message is rendered, and the
  // transition effect focuses the field once it has mounted.
  const focusFirstError = (formErrors: FieldErrors<CheckoutFormValues>) => {
    const first = Object.keys(formErrors)[0] as
      keyof CheckoutFormValues | undefined;
    if (!first) return;
    if (step === 2) {
      pendingErrorFocus.current = first;
      goToDelivery();
      return;
    }
    setFocus(first);
  };

  /**
   * Both steps submit through `handleSubmit` — step 1 to advance, step 2 to
   * place the order (TASK-407).
   *
   * Step 1 used to be a `type="button"` calling `trigger()` by hand, and that is
   * what made the errors stick: RHF arms `reValidateMode` ("onChange" by
   * default) on SUBMIT, and a manual `trigger` is not a submit. So a shopper who
   * pressed «Далі» with an empty phone, then filled it in, went on staring at
   * «Вкажіть коректний номер телефону» until they pressed «Далі» again. Going
   * through `handleSubmit` gives the intended timing for free: nothing is said
   * before the first «Далі», and every message clears as the field is fixed.
   */
  //
  // Built per submit rather than once per render: `focusFirstError` writes a ref,
  // and handing it to `handleSubmit` during render is what the React Compiler's
  // refs rule forbids.
  //
  // The step-2 submit is gated on the offer consent first (TASK-882): the box is
  // on screen, so its message is the one the shopper can act on right away.
  const onStepSubmit = (event?: BaseSyntheticEvent) => {
    if (step === 2 && !consentAccepted) {
      event?.preventDefault();
      setConsentError(true);
      consentRef.current?.focus();
      return;
    }
    return handleSubmit(
      step === 1 ? goToReview : submitOrder,
      focusFirstError,
    )(event);
  };

  const onConsentChange = (checked: boolean) => {
    setConsentAccepted(checked);
    if (checked) setConsentError(false);
  };

  // The same «До сплати» the order summary prints (TASK-864), for the bar.
  const { totalText } = useCheckoutTotal(npCityRef);

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
    // No bottom padding here: the room for the fixed mobile «До сплати» bar is
    // reserved by <body> below the footer (globals.css, TASK-864).
    <div>
      {/* Breadcrumbs — the checkout was the one step of the funnel with no way
          back to the cart except the browser button (TASK-407). Same markup as
          the cart's own trail so the two read as one path; `text-sm` rather than
          that trail's grandfathered `text-[13px]`, since new code takes the
          token scale (TASK-260). */}
      <nav
        aria-label={dict.product.breadcrumbAria}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <Link href="/" className="transition-colors hover:text-foreground">
          {dict.checkout.breadcrumbHome}
        </Link>
        <span aria-hidden="true">/</span>
        <Link href="/cart" className="transition-colors hover:text-foreground">
          {dict.checkout.breadcrumbCart}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-foreground">{dict.checkout.breadcrumb}</span>
      </nav>

      <h1 className={`mb-6 ${H1_CLASS} text-foreground`}>
        {dict.checkout.title}
      </h1>

      <CheckoutStepIndicator current={step} />

      <div className="grid gap-6 lg:grid-cols-checkout lg:items-start">
        <form
          onSubmit={onStepSubmit}
          className="flex min-w-0 flex-col gap-4"
          noValidate
        >
          {step === 1 && (
            <>
              {isGuest && (
                <section className="rounded-card border border-border bg-card p-6 shadow-card">
                  <CheckoutContactFields register={register} errors={errors} />
                </section>
              )}

              <section className="rounded-card border border-border bg-card p-6 shadow-card">
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

              {/* Below md the step's primary rides in the fixed «До сплати»
                  bar (TASK-864); from md up the bar dissolves and the button
                  sits here, under the form, as before. */}
              <MobilePayBar label={dict.checkout.totalLine} amount={totalText}>
                <Button
                  type="submit"
                  size="lg"
                  disabled={isSubmitting}
                  className={MOBILE_BAR_CTA}
                >
                  {dict.checkout.nextStep}
                </Button>
              </MobilePayBar>
            </>
          )}

          {step === 2 && (
            // One card holds the read-back, the consent and the step's actions
            // (Checkout.dc.html «ЦІЛЬ · TASK-882»), so the box sits right above
            // the button it unlocks.
            <section className="flex flex-col gap-4 rounded-card border border-border bg-card p-6 shadow-card">
              <CheckoutReviewStep
                ref={reviewHeadingRef}
                control={control}
                showEmail={isGuest}
              />

              <CheckoutConsent
                ref={consentRef}
                checked={consentAccepted}
                onCheckedChange={onConsentChange}
                showError={consentError}
              />

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
                {/* «Назад» stays in the flow; the confirm rides in the bar
                    below md (TASK-864) and rejoins this row from md up. */}
                <MobilePayBar
                  label={dict.checkout.totalLine}
                  amount={totalText}
                >
                  <Button
                    type="submit"
                    size="lg"
                    disabled={isPending}
                    className={MOBILE_BAR_CTA}
                  >
                    {isPending
                      ? dict.checkout.placingOrder
                      : dict.checkout.placeOrder}
                  </Button>
                </MobilePayBar>
              </div>
            </section>
          )}
        </form>

        {/* STICKY_ASIDE_TOP clears the z-50 site header so the stuck summary
            never sits under it (TASK-206 / TASK-234). */}
        <aside className={`flex flex-col gap-4 lg:sticky ${STICKY_ASIDE_TOP}`}>
          <CheckoutOrderSummary npCityRef={npCityRef} />
          {/* Trust strip under the summary at every width (TASK-864). */}
          <OrderTrustStrip />
        </aside>
      </div>
    </div>
  );
}
