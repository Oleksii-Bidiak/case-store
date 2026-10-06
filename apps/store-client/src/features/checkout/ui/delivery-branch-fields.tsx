"use client";

import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import {
  Controller,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";
import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import { useGetCart } from "@/entities/cart";
import type { PickupPointPublicDto } from "@/entities/delivery";
import { dict } from "@/shared/config";
import { Input, Label } from "@/shared/ui";
import type { CheckoutFormValues } from "../model/checkout-schema";
import {
  centsToMoney,
  courierFreeProgress,
  type CheckoutDeliveryOptions,
} from "../model/delivery";

/*
 * The per-method field sets of the «Отримувач» card (TASK-646,
 * CheckoutDelivery.dc.html #np-down #pickup #courier #other). Nova Poshta proper
 * stays in `checkout-address-form.tsx` with its two autocompletes. Every branch
 * is a subsection under a top border with its own h3, as in the mockup.
 */

type FieldName = keyof CheckoutFormValues;

interface BranchProps {
  register: UseFormRegister<CheckoutFormValues>;
  errors: FieldErrors<CheckoutFormValues>;
}

/** The subsection frame: top rule, h3, then the fields. */
export function DeliveryBranch({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-t border-border pt-5">
      <h3 className="text-base font-semibold text-foreground">{heading}</h3>
      {children}
    </div>
  );
}

/** A muted note with a leading icon — the info / phone notes of the mockup. */
function Note({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-muted px-3.5 py-3 text-sm text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

interface TextFieldProps extends Omit<ComponentProps<typeof Input>, "name"> {
  name: FieldName;
  label: ReactNode;
  hint?: string;
  register: UseFormRegister<CheckoutFormValues>;
  errors: FieldErrors<CheckoutFormValues>;
  /** Extra classes for the wrapper (grid spans). */
  wrapperClassName?: string;
  /** Receives the DOM node next to RHF's own ref. */
  inputRef?: (node: HTMLInputElement | null) => void;
}

/** A registered text input with its label, hint and error, wired for ARIA. */
function TextField({
  name,
  label,
  hint,
  register,
  errors,
  wrapperClassName,
  inputRef,
  ...inputProps
}: TextFieldProps) {
  const id = `checkout-${name}`;
  const message = errors[name]?.message;
  const describedBy =
    [message ? `${id}-error` : null, hint ? `${id}-hint` : null]
      .filter(Boolean)
      .join(" ") || undefined;
  const { ref, ...field } = register(name);
  return (
    <div className={`flex flex-col gap-1.5 ${wrapperClassName ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={message ? true : undefined}
        aria-describedby={describedBy}
        {...inputProps}
        {...field}
        ref={(node) => {
          ref(node);
          inputRef?.(node);
        }}
      />
      {hint && (
        <span id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </span>
      )}
      {message && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}

/**
 * #np-down (TASK-1097) — the Nova Poshta directory did not answer, so the city
 * and the address are typed by hand. The order is then sent without a delivery
 * method and the server books it as «інша доставка»; the warning says what that
 * means for the shopper (an operator will quote the cost).
 *
 * `focusCity` hands focus over to the plain city input when the switch happened
 * while the shopper was typing into the autocomplete it replaces.
 */
export function NpManualBranch({
  register,
  errors,
  focusCity,
}: BranchProps & { focusCity: boolean }) {
  const cityNode = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const node = cityNode.current;
    if (!focusCity || !node) return;
    node.focus();
    const end = node.value.length;
    node.setSelectionRange(end, end);
    // Mount-only: the hand-over happens once, at the switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // Still the Nova Poshta section — the shopper chose Nova Poshta; only the
    // lookup is down (#np-down keeps the «Відділення Нової Пошти» heading).
    <DeliveryBranch heading={dict.checkout.delivery.npHeading}>
      <p
        role="status"
        className="flex items-start gap-2 rounded-lg bg-warning/15 px-3.5 py-3 text-sm text-foreground"
      >
        <TriangleAlert
          className="mt-0.5 size-4 shrink-0 text-warning"
          aria-hidden
        />
        <span>{dict.checkout.delivery.npDownNotice}</span>
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="city"
          label={dict.checkout.fields.city}
          placeholder={dict.checkout.delivery.manualCityPlaceholder}
          autoComplete="address-level2"
          register={register}
          errors={errors}
          inputRef={(node) => {
            cityNode.current = node;
          }}
        />
        <TextField
          name="deliveryAddress"
          label={dict.checkout.delivery.manualAddressLabel}
          placeholder={dict.checkout.delivery.manualAddressPlaceholder}
          autoComplete="street-address"
          register={register}
          errors={errors}
          // The city takes half a row, the address the whole one below it.
          wrapperClassName="sm:col-span-2"
        />
      </div>
    </DeliveryBranch>
  );
}

/** «Київ, вул. Хрещатик, 22» — the point's city, then its street address. */
function pointAddress(point: PickupPointPublicDto): string {
  return [point.city, point.address].filter(Boolean).join(", ");
}

/** «години · телефон» — whichever of the two the shop filled in. */
function pointSchedule(point: PickupPointPublicDto): string {
  return [point.workingHours, point.phone].filter(Boolean).join(" · ");
}

/**
 * #pickup — «Де забрати». A radiogroup of the shop's active points; each card
 * carries the point's address, hours and phone, and a «Як дістатися ↗» link to
 * its map when the shop gave one. The link sits beside the label, not inside
 * it, so following it never selects the point by accident.
 */
export function PickupBranch({
  control,
  points,
}: {
  control: Control<CheckoutFormValues>;
  points: PickupPointPublicDto[];
}) {
  return (
    <DeliveryBranch heading={dict.checkout.delivery.pickupHeading}>
      <Controller
        name="pickupPointId"
        control={control}
        render={({ field, fieldState }) => {
          const errorId = "checkout-pickupPointId-error";
          return (
            <div className="flex flex-col gap-2.5">
              <div
                role="radiogroup"
                aria-label={dict.checkout.delivery.pickupGroupAria}
                aria-invalid={fieldState.error ? true : undefined}
                aria-describedby={
                  fieldState.error ? errorId : "checkout-pickup-note"
                }
                className="flex flex-col gap-2.5"
              >
                {points.map((point, index) => {
                  const id = `checkout-pickup-${point.id}`;
                  const checked = field.value === point.id;
                  const schedule = pointSchedule(point);
                  return (
                    <div
                      key={point.id}
                      className={[
                        "flex items-start gap-2 rounded-xl border-[1.5px] p-4 transition-colors",
                        "has-focus-visible:ring-2 has-focus-visible:ring-ring",
                        checked
                          ? "border-primary bg-primary/6"
                          : "border-border hover:border-primary/60",
                      ].join(" ")}
                    >
                      <label
                        htmlFor={id}
                        className="flex min-w-0 flex-1 cursor-pointer items-start gap-3"
                      >
                        <input
                          id={id}
                          type="radio"
                          className="mt-0.5 size-4 shrink-0 accent-primary"
                          name={field.name}
                          value={point.id}
                          checked={checked}
                          ref={index === 0 ? field.ref : undefined}
                          onBlur={field.onBlur}
                          onChange={() => field.onChange(point.id)}
                        />
                        <span className="flex min-w-0 flex-col gap-0.5 text-sm">
                          <b className="text-foreground">{point.name}</b>
                          <span className="text-foreground">
                            {pointAddress(point)}
                          </span>
                          {schedule && (
                            <span className="text-muted-foreground">
                              {schedule}
                            </span>
                          )}
                        </span>
                      </label>
                      {point.mapUrl && (
                        <a
                          href={point.mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          // Beside the name at every width, as drawn. The
                          // 44px touch target reaches into the card's padding
                          // (-my-3) instead of pushing the text down.
                          className="-my-3 inline-flex min-h-11 shrink-0 items-center rounded ps-2 text-sm font-medium text-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {dict.checkout.delivery.pickupMapLink}
                          <span aria-hidden="true">&nbsp;↗</span>
                          <span className="sr-only">
                            {` ${point.name} ${dict.checkout.consent.newTab}`}
                          </span>
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
              {fieldState.error && (
                <p
                  id={errorId}
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {fieldState.error.message}
                </p>
              )}
            </div>
          );
        }}
      />
      <p id="checkout-pickup-note" className="text-xs text-muted-foreground">
        {dict.checkout.delivery.pickupNote}
      </p>
    </DeliveryBranch>
  );
}

/**
 * #courier / #courier-free — «Адреса для кур'єра». The city is the courier's
 * own and read-only (typed, only when the shop named none); street, house and
 * an optional flat become `address1`.
 * Below, how far the cart is from a free courier, counted on the product
 * subtotal like the server does.
 */
export function CourierBranch({
  register,
  errors,
  courier,
}: BranchProps & { courier: CheckoutDeliveryOptions["courier"] }) {
  const { data } = useGetCart();
  const progress = courierFreeProgress(
    data?.data?.totals?.subtotal,
    courier.freeFrom,
  );
  const city = courier.cityName?.trim();

  return (
    <DeliveryBranch heading={dict.checkout.delivery.courierHeading}>
      {/* A shop that switched the courier on without naming its city (the
          API allows it) — the shopper types the city instead. */}
      {!city && (
        <TextField
          name="courierCity"
          label={dict.checkout.fields.city}
          autoComplete="address-level2"
          register={register}
          errors={errors}
          wrapperClassName="sm:max-w-1/2"
        />
      )}
      {city && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="checkout-courier-city">
            {dict.checkout.fields.city}
          </Label>
          <Input
            id="checkout-courier-city"
            value={city}
            readOnly
            aria-describedby="checkout-courier-city-hint"
            className="bg-muted text-muted-foreground"
          />
          <span
            id="checkout-courier-city-hint"
            className="text-xs text-muted-foreground"
          >
            {dict.checkout.delivery.courierCityHint(city)}
          </span>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-4">
        <TextField
          name="courierStreet"
          label={dict.checkout.delivery.courierStreet}
          autoComplete="address-line1"
          register={register}
          errors={errors}
          wrapperClassName="sm:col-span-2"
        />
        <TextField
          name="courierHouse"
          label={dict.checkout.delivery.courierHouse}
          register={register}
          errors={errors}
        />
        <TextField
          name="courierApartment"
          label={
            <>
              {dict.checkout.delivery.courierApartment}{" "}
              <span className="font-normal text-muted-foreground">
                {dict.common.optional}
              </span>
            </>
          }
          autoComplete="address-line2"
          register={register}
          errors={errors}
        />
      </div>

      {progress &&
        (progress.free ? (
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
            {dict.checkout.delivery.courierFree(progress.thresholdText)}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              {dict.checkout.delivery.courierRemaining}{" "}
              <b className="font-semibold text-foreground">
                {centsToMoney(progress.remainingCents)}
              </b>
            </p>
            <div
              role="progressbar"
              aria-label={dict.checkout.delivery.courierProgressAria}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary transition-all motion-reduce:transition-none"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        ))}
    </DeliveryBranch>
  );
}

/**
 * #other — «Куди доставити». A city and whatever the shopper wants to say about
 * the carrier; the note warns that an operator quotes the cost and that only
 * payment on receipt is possible.
 */
export function OtherBranch({ register, errors }: BranchProps) {
  return (
    <DeliveryBranch heading={dict.checkout.delivery.otherHeading}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="city"
          label={dict.checkout.fields.city}
          autoComplete="address-level2"
          register={register}
          errors={errors}
        />
        <TextField
          name="deliveryAddress"
          label={dict.checkout.delivery.otherAddressLabel}
          placeholder={dict.checkout.delivery.otherAddressPlaceholder}
          hint={dict.checkout.delivery.otherAddressHint}
          autoComplete="street-address"
          register={register}
          errors={errors}
          wrapperClassName="sm:col-span-2"
        />
      </div>
      <Note>{dict.checkout.delivery.otherNote}</Note>
    </DeliveryBranch>
  );
}
