"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLookupOrder, type PublicOrderEntity } from "@/entities/order";
import { dict } from "@/shared/config";
// The mask function rather than `shared/ui`'s `PhoneInput`: this panel draws its
// own fields, exactly like the contact form does, and pulling the shadcn-styled
// input in would drag a second set of base classes into it.
import { formatUAPhone } from "@/shared/lib/phone";
import {
  normalizeOrderNumber,
  orderLookupSchema,
  type OrderLookupFormValues,
} from "../model/order-lookup-schema";
import { OrderLookupResult } from "./order-lookup-result";

const FIELD =
  "h-[46px] rounded-xl border-[1.5px] border-border bg-background px-[15px] text-[14.5px] text-foreground outline-none focus-visible:border-primary";
const LABEL = "text-[13px] font-semibold text-foreground";
const ERROR = "text-[12.5px] font-medium text-destructive";

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

  if (lookup.isSuccess && orders.length > 0) {
    return (
      <div className="flex flex-col gap-6">
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
        <button
          type="button"
          onClick={() => lookup.reset()}
          className="h-11 self-start rounded-xl border border-border bg-background px-6 text-sm font-semibold text-foreground transition-colors hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {d.searchAgain}
        </button>
      </div>
    );
  }

  // 404 → the one generic "not found" sentence (the server refuses to say which
  // half was wrong, so neither do we); 429 → its own copy, because that one is
  // about the request rather than about the order; anything else → generic.
  const status = lookup.error?.response?.status;
  const errorMessage = lookup.isError
    ? status === 404
      ? d.errors.notFound
      : status === 429
        ? d.errors.rateLimited
        : d.errors.generic
    : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-8 shadow-card">
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
          <label className={LABEL} htmlFor="order-lookup-number">
            {d.fieldNumber}
          </label>
          <input
            id="order-lookup-number"
            autoComplete="off"
            placeholder={d.fieldNumberPlaceholder}
            aria-invalid={Boolean(errors.number)}
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
            <span id="order-lookup-number-error" role="alert" className={ERROR}>
              {errors.number.message}
            </span>
          )}
        </div>

        <label className="flex flex-col gap-2">
          <span className={LABEL}>{d.fieldPhone}</span>
          {/* Controlled, not `register`ed: the field shows the mask while the
              form value stays the raw string the shopper typed — the same split
              the checkout and contact fields use. */}
          <Controller
            name="phone"
            control={control}
            render={({ field }) => (
              <input
                id="order-lookup-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder={d.fieldPhonePlaceholder}
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={
                  errors.phone ? "order-lookup-phone-error" : undefined
                }
                className={FIELD}
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                value={formatUAPhone(field.value ?? "")}
                onChange={(event) => field.onChange(event.target.value)}
              />
            )}
          />
          {errors.phone && (
            <span id="order-lookup-phone-error" role="alert" className={ERROR}>
              {errors.phone.message}
            </span>
          )}
        </label>

        {errorMessage && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={lookup.isPending}
          className="h-12 rounded-xl bg-primary text-base font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          {lookup.isPending ? d.submitting : d.submit}
        </button>
      </form>
    </div>
  );
}
