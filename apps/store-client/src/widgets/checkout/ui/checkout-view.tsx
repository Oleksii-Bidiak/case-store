"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type BaseSyntheticEvent,
  type Ref,
} from "react";
import Link from "next/link";
import { CircleAlert, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/entities/session";
import { useGetCart } from "@/entities/cart";
import { clearAppliedDiscount, useAppliedDiscount } from "@/entities/discount";
import {
  CheckoutAddressForm,
  CheckoutConsent,
  CheckoutContactFields,
  CheckoutReviewStep,
  DeliveryMethodPicker,
  lostDeliveryMethod,
  resolveDeliveryMethod,
  useCheckout,
  useCheckoutEmailStatus,
  useDeliveryOptions,
  useCheckoutPrefill,
  useCheckoutSteps,
  checkoutSchemaFor,
  coercePaymentMethod,
  readConfiguredMethods,
  requiresPaymentHandoff,
  resolvePaymentMethods,
  CHECKOUT_DEFAULT_VALUES,
  type CheckoutDeliveryMethod,
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
import { CheckoutSignIn } from "./checkout-sign-in";

/**
 * The step's `<form>` id. Step 1's contact block sits OUTSIDE the form
 * (TASK-2010): its inline sign-in is a form of its own, and a form inside a
 * form is invalid HTML whose submit would bubble into the checkout's. The
 * e-mail joins the form through this id, so Enter there still submits the step.
 */
const CHECKOUT_FORM_ID = "checkout-form";

/**
 * The step's primary button: a full-width 44px thumb target with the CTA radius
 * in the mobile bar, the regular `size="lg"` button from md up (TASK-864).
 * Resolved through `cn()` inside `Button`, which knows the role radii.
 */
const MOBILE_BAR_CTA =
  "h-11 w-full rounded-cta font-bold md:h-10 md:w-auto md:self-start md:rounded-md md:font-medium";

/**
 * The server's refusal of the last order attempt (CheckoutDelivery.dc.html
 * #error): a title, then the server's own sentence word for word. Focusable so
 * the return from step 2 can land on it.
 */
function OrderErrorAlert({
  message,
  ref,
}: {
  message: string;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CircleAlert
        className="mt-0.5 size-5 shrink-0 text-destructive"
        aria-hidden
      />
      <div className="flex min-w-0 flex-col gap-0.5 text-sm text-foreground">
        <b className="font-semibold">{dict.checkout.orderErrorTitle}</b>
        <span>{message}</span>
      </div>
    </div>
  );
}

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
 * guest fills one extra field (email). Since TASK-2010 the same block offers
 * «Створити акаунт на цю пошту» — off unless a promo code or a card needs it —
 * and, for an address that already has an account, an inline sign-in. Either
 * way the order is never gated on it.
 *
 * The two shoppers diverge only at the end (a guest whose account was created
 * with the order counts as signed in — `useCheckout`): a signed-in one is pushed to
 * `/orders/[id]/confirmation`; a guest goes to their token page
 * `/orders/guest/[token]` (TASK-1999), or gets {@link CheckoutGuestSuccess} in
 * place when there is no token — never the confirmation route, which reads an
 * endpoint guests cannot call.
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
    clearError,
    isOrderSubmitted,
    placedOrder,
    guestAccessToken,
    handoffMessage,
    accountPending,
  } = useCheckout({ isGuest });

  // The shop's delivery offer (TASK-646): which methods, the courier's terms,
  // the pickup points and the delivery × payment matrix.
  const { options: deliveryOptions, isLoading: isDeliveryLoading } =
    useDeliveryOptions();

  const {
    register,
    handleSubmit,
    control,
    reset,
    getValues,
    setValue,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutFormValues>({
    // Guests validate one extra field, and a courier whose city the shop never
    // named asks the shopper for it. RHF reassigns `control._options` on every
    // render, so swapping the resolver once either settles takes effect.
    resolver: zodResolver(
      checkoutSchemaFor(isGuest, {
        courierCityFixed: Boolean(deliveryOptions.courier.cityName?.trim()),
      }),
    ),
    defaultValues: CHECKOUT_DEFAULT_VALUES,
  });

  // Seed the form with the logged-in user's saved contact details (name + phone).
  // Also when a guest signs in from the contact block (TASK-2010): the profile
  // then only fills what is still empty, nothing typed is lost.
  useCheckoutPrefill(reset, getValues, isAuthenticated);

  // Two-screen flow: Delivery (step 1) → Review (step 2). The order is created
  // only on the step-2 submit (TASK-146).
  const { step, goToReview, goToDelivery } = useCheckoutSteps();
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const isFirstRender = useRef(true);
  // The invalid field a blocked step-2 submit sends the shopper back to — see
  // `focusFirstError`. Consumed by the step-transition effect below.
  const pendingErrorFocus = useRef<keyof CheckoutFormValues | null>(null);
  // Set when the server refused the order: the return to step 1 lands on the
  // refusal alert at its top instead of the first field.
  const pendingAlertFocus = useRef(false);
  const orderErrorRef = useRef<HTMLDivElement>(null);
  // Set when the chosen method vanished on step 2 (TASK-1998): the return
  // lands on the notice that names it.
  const pendingNoticeFocus = useRef(false);
  const lostNoticeRef = useRef<HTMLParagraphElement>(null);
  // TASK-2010: a 409 ACCOUNT_EXISTS returns to the sign-in at the e-mail.
  const pendingSignInFocus = useRef(false);
  const signInRef = useRef<HTMLDivElement>(null);
  // A guest signed in from the contact block: the block (and the focus in it)
  // is gone, so focus moves on to the recipient once the session lands.
  const pendingAuthFocus = useRef(false);

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
    if (pendingSignInFocus.current) {
      pendingSignInFocus.current = false;
      signInRef.current?.focus();
      return;
    }
    if (pendingAlertFocus.current) {
      pendingAlertFocus.current = false;
      orderErrorRef.current?.focus();
      return;
    }
    if (pendingNoticeFocus.current) {
      pendingNoticeFocus.current = false;
      lostNoticeRef.current?.focus();
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
  const selectedDelivery = useWatch({ control, name: "deliveryMethod" });
  const npManual = useWatch({ control, name: "npManual" }) ?? false;
  const pickupPointId = useWatch({ control, name: "pickupPointId" }) ?? "";
  const createAccount = useWatch({ control, name: "createAccount" }) ?? false;

  // ── The account in checkout (TASK-2010, B-12 тема 2) ─────────────────────
  // Whether the typed address already has an account — asked on blur, or
  // learnt from a 409. Such an address gets a sign-in, never a second account.
  const emailStatus = useCheckoutEmailStatus();
  const emailHasAccount = isGuest && emailStatus.hasAccountFor(guestEmail);
  const offersAccount = isGuest && !emailHasAccount;
  // A promo code (TASK-079) applies only to an account's order.
  const appliedDiscount = useAppliedDiscount();
  // What unticking «Створити акаунт» just changed — see onCreateAccountChange.
  const [untickNotice, setUntickNotice] = useState<string | null>(null);

  // The method to draw: the selection while the shop offers it, otherwise the
  // first offered method. Resolved during render so a pickup-only shop never
  // flashes Nova Poshta fields for the frame before the effect below lands.
  const deliveryMethod = resolveDeliveryMethod(
    selectedDelivery,
    deliveryOptions.methods,
  );

  // …and the form value follows. Also re-asserts itself after the profile
  // prefill's `reset()`, which restores the static default. Not validated: the
  // shopper has not touched the replacement yet, and its empty fields must not
  // greet them with «Місто є обов'язковим» (TASK-1998).
  useEffect(() => {
    if (isDeliveryLoading || selectedDelivery === deliveryMethod) return;
    setValue("deliveryMethod", deliveryMethod);
  }, [isDeliveryLoading, selectedDelivery, deliveryMethod, setValue]);

  // A method the shopper had chosen and the shop has since switched off (a
  // refetch on refocus, or after a `DELIVERY_*` refusal) is never swapped
  // silently (TASK-1998): the notice names it until another method is picked
  // or step 1 is left. Compared with the previous offer during render — the
  // selection still holds the lost method on that render, the effect above
  // replaces it only afterwards.
  const offeredMethods = deliveryOptions.methods;
  const offerKey = isDeliveryLoading ? null : offeredMethods.join(",");
  const [seenOffer, setSeenOffer] = useState<{
    key: string;
    methods: readonly CheckoutDeliveryMethod[];
  } | null>(null);
  const [lostMethod, setLostMethod] = useState<{
    method: CheckoutDeliveryMethod;
    replacement: CheckoutDeliveryMethod;
  } | null>(null);
  if (offerKey !== null && offerKey !== seenOffer?.key) {
    setSeenOffer({ key: offerKey, methods: offeredMethods });
    const lost = lostDeliveryMethod(
      selectedDelivery,
      seenOffer?.methods ?? null,
      offeredMethods,
    );
    if (lost) setLostMethod({ method: lost, replacement: deliveryMethod });
  }
  // The shopper picked another method themselves — the notice has done its job.
  if (
    lostMethod &&
    selectedDelivery !== lostMethod.method &&
    selectedDelivery !== lostMethod.replacement
  ) {
    setLostMethod(null);
  }
  // Lost on the review step: what it reads back is no longer on offer, and
  // step 1 is the only place the method can be changed. Back there, focus on
  // the notice.
  useEffect(() => {
    if (!lostMethod || step !== 2) return;
    pendingNoticeFocus.current = true;
    goToDelivery();
  }, [lostMethod, step, goToDelivery]);

  // A lone pickup point is preselected — there is nothing to choose. Of several,
  // none is (TASK-1997): a guessed point can send the shopper to the wrong
  // shop, so they pick one and the schema says so if they don't. A choice still
  // offered holds; one the shop has since deactivated is cleared, never
  // submitted.
  const pointIds = deliveryOptions.pickupPoints.map((point) => point.id);
  const resolvedPointId = pointIds.includes(pickupPointId)
    ? pickupPointId
    : pointIds.length === 1
      ? pointIds[0]
      : "";
  useEffect(() => {
    if (isDeliveryLoading || resolvedPointId === pickupPointId) return;
    setValue("pickupPointId", resolvedPointId, {
      shouldValidate: resolvedPointId !== "",
    });
  }, [isDeliveryLoading, resolvedPointId, pickupPointId, setValue]);

  // Which payment methods this deployment offers, narrowed to what THIS shopper
  // can actually complete. Recomputed when the session settles — the online
  // options need an account, the payment endpoint being behind a JWT guard —
  // and when the delivery changes: the server's matrix rules some out
  // (TASK-646), and the on-delivery note names where the money changes hands.
  const paymentOptions = useMemo(
    () =>
      resolvePaymentMethods({
        configured: readConfiguredMethods(),
        isAuthenticated,
        guestHasAccount: emailHasAccount,
        delivery: {
          method: deliveryMethod,
          npManual,
          matrix: deliveryOptions.paymentMatrix,
        },
      }),
    [
      isAuthenticated,
      emailHasAccount,
      deliveryMethod,
      npManual,
      deliveryOptions.paymentMatrix,
    ],
  );

  // A promo code or a card needs the account: tick the box the moment either
  // is chosen (a code may also arrive already applied from the cart). The
  // reason is said next to the box — `accountNotice` below.
  const needsAccount =
    Boolean(appliedDiscount) || requiresPaymentHandoff(paymentMethod);
  useEffect(() => {
    if (offersAccount && needsAccount && !createAccount) {
      setValue("createAccount", true);
    }
  }, [offersAccount, needsAccount, createAccount, setValue]);

  // An address with an account never gets a second one (409 ACCOUNT_EXISTS):
  // the box goes, and so does its tick.
  useEffect(() => {
    if (emailHasAccount && createAccount) setValue("createAccount", false);
  }, [emailHasAccount, createAccount, setValue]);

  /**
   * The shopper changes the box themselves. Unticking takes away what needs
   * the account — the code is removed, card / instalments fall back to paying
   * on delivery — and says so in the live region; nothing changes silently.
   */
  const onCreateAccountChange = (checked: boolean) => {
    setValue("createAccount", checked);
    if (checked) {
      setUntickNotice(null);
      return;
    }
    const notes: string[] = [];
    if (appliedDiscount) {
      clearAppliedDiscount();
      notes.push(dict.checkout.guest.promoRemoved);
    }
    if (requiresPaymentHandoff(paymentMethod)) {
      setValue(
        "paymentMethod",
        coercePaymentMethod("ON_DELIVERY", paymentOptions),
      );
      notes.push(dict.checkout.guest.paymentSwitched);
    }
    setUntickNotice(notes.length > 0 ? notes.join(" ") : null);
  };

  // Why the box is ticked, while it is for a reason; otherwise what unticking
  // it changed.
  const accountNotice =
    offersAccount && createAccount
      ? appliedDiscount
        ? dict.checkout.guest.createAccountForPromo
        : requiresPaymentHandoff(paymentMethod)
          ? dict.checkout.guest.createAccountForCard
          : null
      : untickNotice;

  // Signed in from the contact block: back to the step with nothing lost
  // (the prefill only fills empty fields), focus on the recipient.
  const onInlineSignIn = () => {
    clearError();
    pendingAuthFocus.current = true;
  };
  useEffect(() => {
    if (!isAuthenticated || !pendingAuthFocus.current) return;
    pendingAuthFocus.current = false;
    setFocus("firstName");
  }, [isAuthenticated, setFocus]);

  // A session that expires mid-checkout (TASK-773) disables the online methods
  // under a choice already made. Nothing would then be checked, and the order
  // would go out as a guest with a method guests cannot complete — fall back to
  // the method this shopper can still use. The same holds when the delivery
  // changes to one the matrix restricts (TASK-646): card → «інша доставка».
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
  // Step 1 → 2. A refusal still on record from the last attempt is dropped:
  // the shopper has acted on it, and it must not greet them a second time.
  const advance = () => {
    clearError();
    setLostMethod(null);
    goToReview();
  };

  // A refused order goes back to step 1 (CheckoutDelivery.dc.html #error): the
  // refusal is usually about the delivery — a method or a point the shop has
  // just switched off — and step 1 is the only place it can be changed. Any
  // other failure (network, 5xx, a lapsed session) leaves the shopper on step 2
  // to retry, with the same alert at the top of the card.
  //
  // TASK-2010: the two account answers go back to step 1 as well. 409
  // ACCOUNT_EXISTS turns the contact block into the sign-in and lands on it;
  // a code or a card refused for want of an account ticks the box, and the
  // alert says why — the next «Підтвердити» then creates the account.
  const placeOrder = async (values: CheckoutFormValues) => {
    const outcome = await submitOrder(values);
    if (outcome === "account-exists") {
      emailStatus.markHasAccount(values.email);
      pendingSignInFocus.current = true;
      goToDelivery();
      return;
    }
    if (outcome === "account-required") {
      if (offersAccount) setValue("createAccount", true);
      pendingAlertFocus.current = true;
      goToDelivery();
      return;
    }
    if (outcome !== "refused") return;
    pendingAlertFocus.current = true;
    goToDelivery();
  };

  const onStepSubmit = (event?: BaseSyntheticEvent) => {
    if (step === 2 && !consentAccepted) {
      event?.preventDefault();
      setConsentError(true);
      consentRef.current?.focus();
      return;
    }
    return handleSubmit(
      step === 1 ? advance : placeOrder,
      focusFirstError,
    )(event);
  };

  const onConsentChange = (checked: boolean) => {
    setConsentAccepted(checked);
    if (checked) setConsentError(false);
  };

  // The same «До сплати» the order summary prints (TASK-864), for the bar.
  const { totalText, excludesShipping } = useCheckoutTotal({
    method: deliveryMethod,
    npManual,
    npCityRef,
  });
  // TASK-647: the bar says what the summary says under «До сплати» — a total
  // that leaves an unpriced delivery out must not pass for the bill.
  const payBarNote = excludesShipping
    ? dict.checkout.delivery.payBarWithoutShipping
    : undefined;

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
  // either navigating to the confirmation page / the guest order page or
  // already showing the guest success panel (the TASK-119 redirect race).
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
        guestAccessToken={guestAccessToken}
        handoffMessage={handoffMessage}
        accountPending={accountPending}
      />
    );
  }

  // The delivery list gates the form too: drawing it before the list arrives
  // would show Nova Poshta fields to a shop that only does pickup.
  if (
    isInitializing ||
    isCartLoading ||
    isDeliveryLoading ||
    (cartIsEmpty && !isOrderSubmitted)
  ) {
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
        <div className="flex min-w-0 flex-col gap-4">
          {step === 1 && (
            <>
              {/* The server's refusal of the last attempt, word for word,
                  above everything it may be about (#error). Focused on the
                  way back from step 2. */}
              {isError && errorMessage && (
                <OrderErrorAlert ref={orderErrorRef} message={errorMessage} />
              )}

              {/* The chosen method the shop has just switched off, by name —
                  never a silent swap (TASK-1998). */}
              {lostMethod && (
                <p
                  ref={lostNoticeRef}
                  role="status"
                  tabIndex={-1}
                  className="flex items-start gap-2 rounded-xl border border-warning/45 bg-warning/10 px-4 py-3.5 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <TriangleAlert
                    className="mt-0.5 size-4 shrink-0 text-warning"
                    aria-hidden
                  />
                  <span>
                    {
                      dict.checkout.delivery.methodUnavailable[
                        lostMethod.method
                      ]
                    }
                  </span>
                </p>
              )}

              {/* The method first (CheckoutDelivery.dc.html): it decides
                  which fields follow. A lone method is only named. */}
              <DeliveryMethodPicker
                control={control}
                setValue={setValue}
                options={deliveryOptions}
                npCityRef={npCityRef}
              />

              {/* The e-mail right after the method, before the address
                  (B-13 §0): a sign-in happens before much is typed. Outside
                  the <form> — see CHECKOUT_FORM_ID. */}
              {isGuest && (
                <section className="rounded-card border border-border bg-card p-6 shadow-card">
                  <CheckoutContactFields
                    register={register}
                    errors={errors}
                    formId={CHECKOUT_FORM_ID}
                    onEmailBlur={emailStatus.check}
                    createAccount={createAccount}
                    onCreateAccountChange={onCreateAccountChange}
                    accountNotice={accountNotice}
                    hasAccount={emailHasAccount}
                    signInRef={signInRef}
                    signIn={
                      emailHasAccount ? (
                        <CheckoutSignIn
                          email={guestEmail.trim()}
                          onAuthenticated={onInlineSignIn}
                        />
                      ) : null
                    }
                  />
                </section>
              )}
            </>
          )}

          <form
            id={CHECKOUT_FORM_ID}
            onSubmit={onStepSubmit}
            className="flex min-w-0 flex-col gap-4"
            noValidate
          >
            {step === 1 && (
              <>
                <section className="rounded-card border border-border bg-card p-6 shadow-card">
                  <CheckoutAddressForm
                    legend={dict.checkout.delivery.recipientHeading}
                    register={register}
                    control={control}
                    setValue={setValue}
                    errors={errors}
                    method={deliveryMethod}
                    options={deliveryOptions}
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
                <MobilePayBar
                  label={dict.checkout.totalLine}
                  amount={totalText}
                  amountNote={payBarNote}
                >
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
                {/* A failure that is not a refusal keeps the shopper here — at
                  the top of the card, never under the fixed mobile bar. */}
                {isError && errorMessage && (
                  <OrderErrorAlert message={errorMessage} />
                )}

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
                    amountNote={payBarNote}
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
        </div>

        {/* STICKY_ASIDE_TOP clears the z-50 site header so the stuck summary
            never sits under it (TASK-206 / TASK-234). */}
        <aside className={`flex flex-col gap-4 lg:sticky ${STICKY_ASIDE_TOP}`}>
          <CheckoutOrderSummary
            method={deliveryMethod}
            npManual={npManual}
            npCityRef={npCityRef}
          />
          {/* Trust strip under the summary at every width (TASK-864). */}
          <OrderTrustStrip />
        </aside>
      </div>
    </div>
  );
}
