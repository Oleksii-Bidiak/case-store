"use client";

import { useEffect, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLookupOrder, type PublicOrderEntity } from "@/entities/order";
import { dict } from "@/shared/config";
import { Button, Input, Label, PhoneInput } from "@/shared/ui";
import {
  normalizeOrderNumber,
  orderLookupSchema,
  type OrderLookupFormValues,
} from "../model/order-lookup-schema";
import { OrderLookupResult } from "./order-lookup-result";

// TASK-872: the fields are the `shared/ui` primitives, so they carry the same
// focus-visible ring, invalid border and disabled look as every other storefront
// form. `h-11` is the 44px touch target; the radius stays the primitive's
// `rounded-md` (DS §5 — inputs), and `bg-background` lifts them off the card.
const FIELD = "h-11 bg-background";
const LABEL = "font-semibold text-foreground";
const ERROR = "text-xs font-medium text-destructive";

/**
 * OrderLookupForm — the public "номер + телефон" form (TASK-483).
 *
 * ── Why the page exists ───────────────────────────────────────────────────────
 * Until now an order could be seen exactly one way: the link in the confirmation
 * email. That is also the easiest thing in the whole flow to lose — a deleted
 * mail, a typo in the address, a spam folder, or an order an operator took by
 * phone, for which no letter was ever sent. "Seeing your order must be possible
 * in more than one way" is the principle behind decision B-5.
 *
 * ── Why every failure reads the same ──────────────────────────────────────────
 * The API answers one identical 404 for an unknown number, the right number with
 * the wrong phone, a malformed number and a deleted order. This component keeps
 * that property: a single message covers all of them and hints at none. The only
 * response it words differently is 429, which is about the REQUEST, not about
 * whether an order exists.
 */
export function OrderLookupForm() {
  const d = dict.orderLookup;
  const lookup = useLookupOrder();

  const {
    register,
    handleSubmit,
    control,
    setFocus,
    formState: { errors },
  } = useForm<OrderLookupFormValues>({
    resolver: zodResolver(orderLookupSchema),
    defaultValues: { number: "", phone: "" },
  });

  const onSubmit = (values: OrderLookupFormValues) => {
    lookup.mutate({
      data: {
        // Normalised on both ends. The server normalises again — this is a
        // courtesy so the request carries what the user meant, not a security
        // measure, and it is written that way round on purpose.
        number: normalizeOrderNumber(values.number),
        phone: values.phone,
      },
    });
  };

  const orders: PublicOrderEntity[] = lookup.data?.data ?? [];
  const showResults = lookup.isSuccess && orders.length > 0;

  // TASK-626. The form is REPLACED by the result, so the submit button the focus
  // was on unmounts and focus falls to <body>: a keyboard user is thrown to the
  // top of the page and a screen reader hears nothing. Focus moves to the result
  // instead, and back to the first field on «search again». The ref tracks the
  // last state focus was moved for, so a re-render does not steal it again.
  const resultsRef = useRef<HTMLDivElement>(null);
  const focusedFor = useRef<"results" | "form" | null>(null);
  useEffect(() => {
    if (showResults && focusedFor.current !== "results") {
      focusedFor.current = "results";
      resultsRef.current?.focus();
    } else if (!showResults && focusedFor.current === "results") {
      focusedFor.current = "form";
      setFocus("number");
    }
  }, [showResults, setFocus]);

  // Kept at the same position in both branches below so React keeps ONE node
  // mounted: a live region that is created already holding its text is not
  // reliably announced, one whose text changes is.
  const announcer = (
    <p role="status" aria-live="polite" className="sr-only">
      {showResults ? d.resultsAnnounce(orders.length) : ""}
    </p>
  );

  if (showResults) {
    return (
      <>
        {announcer}
        <div
          ref={resultsRef}
          tabIndex={-1}
          aria-label={d.resultsRegionAria}
          role="region"
          className="flex flex-col gap-6 focus:outline-none"
        >
          {orders.length > 1 && (
            <p className="text-sm text-muted-foreground">
              {d.resultsMultiple(orders.length)}
            </p>
          )}
          {orders.map((order) => (
            <OrderLookupResult key={order.number} order={order} />
          ))}
          <p className="text-xs leading-relaxed text-muted-foreground">
            {d.privacyNote}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => lookup.reset()}
            className="h-11 self-start rounded-cta px-6 font-semibold"
          >
            {d.searchAgain}
          </Button>
        </div>
      </>
    );
  }

  // 404 → the one generic "not found" sentence (the server refuses to say which
  // half was wrong, so neither do we); 429 → its own copy, because that one is
  // about the request rather than about the order; anything else → generic.
  //
  // TASK-872: a 200 with an EMPTY list is a miss too, and used to drop the
  // shopper back on the form with no word at all — as if the button did nothing.
  // It reads exactly like the 404: wording it differently would tell a guesser
  // which of the two answers came back, the one distinction the API hides.
  const status = lookup.error?.response?.status;
  const errorMessage = lookup.isError
    ? status === 404
      ? d.errors.notFound
      : status === 429
        ? d.errors.rateLimited
        : d.errors.generic
    : lookup.isSuccess && orders.length === 0
      ? d.errors.notFound
      : null;

  return (
    <>
      {announcer}
      <div className="rounded-card border border-border bg-card p-8 shadow-card">
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          {d.intro}
        </p>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
          noValidate
        >
          {/* The hint and the error live OUTSIDE the <label>, wired by
            `aria-describedby`. Inside it they would become part of the field's
            accessible NAME — a screen reader would read "Номер замовлення 8
            символів — можна з «#»…" as the name of the box, and every
            name-based query (tests included) would stop matching. Described-by
            is the relationship that means "extra information about", which is
            what a hint is. */}
          <div className="flex flex-col gap-2">
            <Label className={LABEL} htmlFor="order-lookup-number">
              {d.fieldNumber}
            </Label>
            <Input
              id="order-lookup-number"
              autoComplete="off"
              placeholder={d.fieldNumberPlaceholder}
              aria-invalid={errors.number ? true : undefined}
              aria-describedby={
                errors.number
                  ? "order-lookup-number-error order-lookup-hint"
                  : "order-lookup-hint"
              }
              className={`${FIELD} font-mono uppercase`}
              {...register("number")}
            />
            <span
              id="order-lookup-hint"
              className="text-xs text-muted-foreground"
            >
              {d.fieldNumberHint}
            </span>
            {errors.number && (
              <span
                id="order-lookup-number-error"
                role="alert"
                className={ERROR}
              >
                {errors.number.message}
              </span>
            )}
          </div>

          {/* Same shape as the number field: a sibling <Label>, the error
            outside it. It used to sit INSIDE a wrapping <label>, which made
            the error text part of the phone box's accessible name. */}
          <div className="flex flex-col gap-2">
            <Label className={LABEL} htmlFor="order-lookup-phone">
              {d.fieldPhone}
            </Label>
            {/* Controlled, not `register`ed: `PhoneInput` shows the mask while
              the form value stays the raw string the shopper typed — the same
              split the checkout field uses. */}
            <Controller
              name="phone"
              control={control}
              render={({ field }) => (
                <PhoneInput
                  id="order-lookup-phone"
                  autoComplete="tel"
                  placeholder={d.fieldPhonePlaceholder}
                  aria-invalid={errors.phone ? true : undefined}
                  aria-describedby={
                    errors.phone ? "order-lookup-phone-error" : undefined
                  }
                  className={FIELD}
                  {...field}
                />
              )}
            />
            {errors.phone && (
              <span
                id="order-lookup-phone-error"
                role="alert"
                className={ERROR}
              >
                {errors.phone.message}
              </span>
            )}
          </div>

          {errorMessage && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {errorMessage}
            </p>
          )}

          <Button
            type="submit"
            disabled={lookup.isPending}
            className="h-12 w-full rounded-cta text-base font-bold"
          >
            {lookup.isPending ? d.submitting : d.submit}
          </Button>
        </form>
      </div>
    </>
  );
}
