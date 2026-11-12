"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  Controller,
  useForm,
  useWatch,
  type FieldErrors,
  type UseFormReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { CircleCheckIcon, CircleIcon } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  CreateManualOrderDtoPaymentMethod,
  getAdminOrderControllerFindAllQueryKey,
  useAdminOrderControllerCreate,
} from "@/entities/order";
import { getAdminDashboardControllerGetNeedsActionQueryKey } from "@/entities/dashboard";
import {
  ADDRESS_LIMITS,
  NpCityField,
  NpWarehouseField,
  clearNpRefs,
  PickupPointPicker,
  useGetDeliveryMethods,
  type DeliveryMethod,
} from "@/entities/delivery";
import {
  Button,
  Checkbox,
  CopyButton,
  FormAlert,
  Input,
  Label,
  PillGroup,
  Separator,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@/shared/ui";
import { PhoneInput } from "@/shared/ui/phone-input";
import { dict } from "@/shared/config";
import { apiErrorStatus, cn, countLabel, formatCurrency } from "@/shared/lib";
import { applyServerFieldErrors } from "@/shared/lib/form-errors";
import { EMAIL_MAX_LENGTH } from "@/shared/lib/form-fields";
import {
  CONTACT_PHONE_MAX_LENGTH,
  CREATE_ORDER_DEFAULTS,
  CUSTOMER_MODE,
  INTERNAL_NOTES_MAX_LENGTH,
  NOTES_MAX_LENGTH,
  allowedPaymentMethods,
  createOrderSchema,
  createOrderValuesToDto,
  operatorShippingCost,
  type CreateOrderFormValues,
  type DraftLine,
  type PickedCustomer,
} from "../model/create-order-schema";
import {
  CREATE_ORDER_FIELD_MESSAGES,
  createOrderFieldMap,
  readCreateOrderRefusal,
  type CreateOrderRefusal,
} from "../model/create-order-error";
import { OrderLinePicker } from "./order-line-picker";
import { OrderCustomerPicker } from "./order-customer-picker";

const t = dict.orderCreate;

type CreateForm = UseFormReturn<CreateOrderFormValues>;

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  [CreateManualOrderDtoPaymentMethod.ON_DELIVERY]: t.methodOnDelivery,
  [CreateManualOrderDtoPaymentMethod.ONLINE]: t.methodOnline,
  [CreateManualOrderDtoPaymentMethod.INSTALLMENTS]: t.methodInstallments,
  [CreateManualOrderDtoPaymentMethod.BANK_TRANSFER]: t.methodBankTransfer,
};

/**
 * The methods offered until `GET /api/delivery/methods` answers — the schema
 * defaults of the delivery settings (NP and «Інша доставка» on).
 */
const FALLBACK_METHODS: readonly DeliveryMethod[] = ["NOVA_POSHTA", "OTHER"];

/** «Нова Пошта», «Самовивіз», «Курʼєр», «Інша доставка». */
const METHOD_LABELS = dict.orders.deliveryMethodLabels as Record<
  string,
  string
>;

/** Recipient fields the «той самий клієнт» checkbox hides. */
const RECIPIENT_FIELDS = ["firstName", "lastName", "phone"] as const;

/**
 * Client fields the customer picker fills (TASK-2398). The picker remembers
 * what it wrote, so a later pick (or «Змінити клієнта») replaces only what is
 * still its own — an edit by the operator is never overwritten, and a previous
 * customer's details never linger silently.
 */
const PREFILL_FIELDS = [
  "contactFirstName",
  "contactLastName",
  "contactPhone",
  "contactEmail",
] as const;
type PrefillField = (typeof PREFILL_FIELDS)[number];

/** Why card / instalments are off for this delivery method (TASK-1021). */
const PAYMENT_REASON_ID = "order-create-payment-reason";

const ITEMS_ANCHOR = "order-create-section-items";
const CUSTOMER_ANCHOR = "order-create-section-customer";

type ErrorLink = { id: string; label: string };

/**
 * How each field is named in the «Перевірте N полів» list (Н2), and where its
 * link lands. In form order — client, then «Товари», then the rest — so the
 * list reads top to bottom like the form.
 */
const CLIENT_FIELDS: ReadonlyArray<[keyof CreateOrderFormValues, string]> = [
  ["userId", t.customerHeading],
  ["contactPhone", t.contactPhone],
  ["contactFirstName", t.contactName],
  ["contactLastName", t.contactLastName],
  ["contactEmail", t.contactEmail],
];
const REST_FIELDS: ReadonlyArray<[keyof CreateOrderFormValues, string]> = [
  ["firstName", t.addressFirstName],
  ["lastName", t.addressLastName],
  ["phone", t.addressPhone],
  ["city", t.addressCity],
  ["address1", t.addressAddress1],
  ["postalCode", t.addressPostalCode],
  ["pickupPointId", t.deliveryPickupLabel],
  ["shippingCost", t.shippingCostLabel],
  ["notes", t.notes],
  ["internalNotes", t.internalNotes],
];

const anchorOf = (name: keyof CreateOrderFormValues): string =>
  name === "userId"
    ? CUSTOMER_ANCHOR
    : name === "internalNotes"
      ? "order-create-internal-notes"
      : `order-create-${name}`;

function errorLinksOf(
  errors: FieldErrors<CreateOrderFormValues>,
  itemsMissing: boolean,
): ErrorLink[] {
  // The recipient fields carry no error while they are hidden: the schema does
  // not judge them then (TASK-2398), so nothing here has to filter them out.
  const links = (fields: typeof CLIENT_FIELDS) =>
    fields
      .filter(([name]) => errors[name])
      .map(([name, label]) => ({ id: anchorOf(name), label }));
  return [
    ...links(CLIENT_FIELDS),
    ...(itemsMissing ? [{ id: ITEMS_ANCHOR, label: t.itemsHeading }] : []),
    ...links(REST_FIELDS),
  ];
}

/**
 * Create an order on the customer's behalf — a phone order (TASK-341; wave 198
 * TASK-1047, OrderNewProposal Н1–Н4).
 *
 * Four numbered sections (Клієнт · Товари · Доставка · Оплата й примітки) and a
 * sticky «Підсумок» beside them: what is still wrong (with links to each
 * field), what the server refused, the totals, a checklist, and the two
 * buttons. One column on a phone.
 *
 * «Одержувач — той самий клієнт» is on by default (TASK-2398): the recipient
 * fields are then neither rendered nor validated, and the client block — its
 * own «Імʼя», «Прізвище» and «Телефон», in both modes — is sent as the
 * recipient. A missing surname is therefore an error under the client's
 * «Прізвище», and the checkbox is the operator's alone: nothing unticks it.
 *
 * This is a CREATE form, so forms.md Rule 2 does not bite: nothing async seeds
 * it. The picked lines are local state — a list with its own add/remove/qty.
 */
export function OrderCreateForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const createOrder = useAdminOrderControllerCreate();

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [linesTouched, setLinesTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [refusal, setRefusal] = useState<CreateOrderRefusal | null>(null);
  // What the customer picker last wrote into each client field (TASK-2398).
  const prefilled = useRef<Partial<Record<PrefillField, string>>>({});
  // The chosen account's display data (TASK-426). Lives HERE because the picker
  // unmounts every time the operator switches to the «за телефоном» tab.
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  // TASK-484: the created order plus its ONE-TIME buyer link. Never cached.
  const [created, setCreated] = useState<{
    id: string;
    accessUrl: string | null;
    emailed: boolean;
  } | null>(null);

  const form = useForm<CreateOrderFormValues>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: CREATE_ORDER_DEFAULTS,
  });

  // `useWatch`, not `form.watch` — memoization-safe. The summary's checklist
  // reads most of the form, so the whole value set is watched once here.
  const values = useWatch({ control: form.control }) as CreateOrderFormValues;
  const customerMode = values.customerMode;
  const sameRecipient = values.sameRecipient;

  // TASK-1973: what the shop offers right now — the same public read the
  // checkout uses: enabled methods (PICKUP only with an active point), the
  // points, the courier terms and the delivery × payment matrix.
  const offer = useGetDeliveryMethods().data?.data;
  const offeredMethods = offer?.methods ?? FALLBACK_METHODS;
  const pickupPoints = offer?.pickupPoints ?? [];
  const deliveryMethod = values.deliveryMethod;
  const pickedPoint = pickupPoints.find(
    (point) => point.id === values.pickupPointId,
  );

  // A method the shop does not offer (switched off since the default was
  // chosen) is replaced by the first one it does.
  const firstOffered = offeredMethods[0];
  const methodOffered = offeredMethods.includes(deliveryMethod);
  useEffect(() => {
    if (offer && !methodOffered && firstOffered) {
      form.setValue("deliveryMethod", firstOffered, { shouldDirty: true });
    }
  }, [offer, methodOffered, firstOffered, form]);

  // TASK-1021: the delivery × payment matrix is a money invariant — «Інша
  // доставка» has no final amount, so card and instalments are refused. Say so
  // before the submit: those pills are disabled, with the reason under them.
  const allowedPayments = allowedPaymentMethods(
    deliveryMethod,
    offer?.paymentMatrix,
  );
  const paymentAllowed = allowedPayments.includes(values.paymentMethod);
  useEffect(() => {
    if (!paymentAllowed) {
      // The method changed under a choice it refuses: fall back to the one
      // payment every method takes, rather than keep one the server refuses.
      form.setValue(
        "paymentMethod",
        CreateManualOrderDtoPaymentMethod.ON_DELIVERY,
        { shouldValidate: true, shouldDirty: true },
      );
    }
  }, [paymentAllowed, form]);

  const chooseDeliveryMethod = (method: string) => {
    form.setValue("deliveryMethod", method as DeliveryMethod, {
      shouldDirty: true,
    });
    // Leaving NP drops the directory refs (review R3): see `clearNpRefs`.
    if (method !== "NOVA_POSHTA") clearNpRefs(form);
    // Errors of the previous method's fields are no longer the operator's.
    form.clearErrors(["city", "address1", "pickupPointId", "shippingCost"]);
  };

  /**
   * Write the picked account's details into the client block (TASK-2398) — a
   * field only while it is EMPTY or still holds what the previous pick wrote;
   * whatever the operator typed stays. `null` (the customer cleared) takes the
   * previous pick's values back out the same way.
   */
  const prefillClient = (picked: PickedCustomer | null) => {
    const next: Record<PrefillField, string> = {
      contactFirstName: picked?.firstName ?? "",
      contactLastName: picked?.lastName ?? "",
      contactPhone: picked?.phone ?? "",
      contactEmail: picked?.email ?? "",
    };
    const written: Partial<Record<PrefillField, string>> = {};
    for (const field of PREFILL_FIELDS) {
      const current = form.getValues(field);
      const ours = prefilled.current[field];
      if (current !== "" && current !== ours) continue; // the operator's
      if (current !== next[field]) {
        // Rule 4a: a value set from code re-validates — once there was a
        // submit, so nothing is said before it.
        form.setValue(field, next[field], {
          shouldDirty: true,
          shouldValidate: form.formState.isSubmitted,
        });
      }
      if (next[field] !== "") written[field] = next[field];
    }
    prefilled.current = written;
  };

  const selectCustomer = (picked: PickedCustomer) => {
    setCustomer(picked);
    form.setValue("userId", picked.id, { shouldValidate: true });
    prefillClient(picked);
  };

  const clearCustomer = () => {
    setCustomer(null);
    form.setValue("userId", "");
    prefillClient(null);
  };

  const toggleSameRecipient = (checked: boolean) => {
    form.setValue("sameRecipient", checked, { shouldDirty: true });
    // Which fields are judged just changed: after a submit, re-judge them all
    // so an error of a field that is no longer asked for does not linger.
    if (form.formState.isSubmitted) void form.trigger();
  };

  const onValid = (formValues: CreateOrderFormValues) => {
    // Checked AFTER the schema, not instead of it: «Додайте хоча б один товар»
    // and the field errors are shown together (Н2).
    if (lines.length === 0) return;

    setRefusal(null);
    createOrder.mutate(
      { data: createOrderValuesToDto(formValues, lines, pickedPoint) },
      {
        onSuccess: (response) => {
          void queryClient.invalidateQueries({
            queryKey: getAdminOrderControllerFindAllQueryKey(),
          });
          // TASK-400: a new PENDING order moves the needs-action badge.
          void queryClient.invalidateQueries({
            queryKey: getAdminDashboardControllerGetNeedsActionQueryKey(),
          });
          toast.success(t.success);
          // TASK-484: DO NOT navigate yet — `meta.accessUrl` exists only here.
          setCreated({
            id: response.data.id,
            accessUrl: response.meta.accessUrl,
            // Only a walk-in's email is sent (the picker may have filled the
            // field from an account; that order goes to the account instead).
            emailed:
              formValues.customerMode === CUSTOMER_MODE.GUEST &&
              formValues.contactEmail.trim() !== "",
          });
        },
        onError: (error) => {
          // TASK-957 / Н3, TASK-1984 Rule 6: a 400 is placed where it can be
          // fixed — `fieldErrors` under the fields (the «Перевірте N полів»
          // list then points at them), a refused line under that line. Only
          // what nobody could place is said in the «Підсумок» box — once, so
          // no toast on top of it.
          const placed =
            apiErrorStatus(error) === 400
              ? applyServerFieldErrors(
                  error,
                  form.setError,
                  createOrderFieldMap(
                    formValues.sameRecipient,
                    formValues.deliveryMethod,
                  ),
                  CREATE_ORDER_FIELD_MESSAGES,
                )
              : undefined;
          const refusal = readCreateOrderRefusal(error, lines, placed);
          if (refusal) {
            setRefusal(refusal);
            return;
          }
          toast.error(t.failed);
        },
      },
    );
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    setSubmitted(true);
    setLinesTouched(true);
    return form.handleSubmit(onValid)(event);
  };

  if (created) {
    return (
      <OrderCreated
        created={created}
        onOpen={(id) => router.push(`/orders/${id}`)}
      />
    );
  }

  const errors = form.formState.errors;
  const itemsMissing = linesTouched && lines.length === 0;
  const errorLinks = submitted ? errorLinksOf(errors, itemsMissing) : [];

  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const goods =
    lines.reduce(
      (sum, line) => sum + Math.round(Number(line.price) * 100) * line.quantity,
      0,
    ) / 100;

  const clientDone =
    (customerMode === CUSTOMER_MODE.ACCOUNT
      ? Boolean(values.userId)
      : Boolean(
          values.contactFirstName?.trim() && values.contactPhone?.trim(),
        )) &&
    // While the client is also the recipient, its surname and phone are due.
    (!sameRecipient ||
      Boolean(
        values.contactFirstName?.trim() &&
        values.contactLastName?.trim() &&
        values.contactPhone?.trim(),
      ));
  // TASK-1808: what the delivery adds, per method — Nova Poshta is paid at the
  // branch (B-13), an OTHER cost only once one has been agreed.
  const quote = operatorShippingCost(values, offer?.courier, goods);
  const shipping = quote.kind === "amount" ? quote.amount : 0;
  const deliveryValue =
    quote.kind === "carrier"
      ? t.summaryDeliveryValue
      : quote.kind === "pending"
        ? t.summaryDeliveryPending
        : quote.amount === 0
          ? t.summaryDeliveryFree
          : formatCurrency(quote.amount);

  const destinationDone =
    deliveryMethod === "PICKUP"
      ? Boolean(pickedPoint)
      : Boolean(values.city?.trim() && values.address1?.trim()) &&
        (deliveryMethod !== "NOVA_POSHTA" || Boolean(values.npCityRef));
  const deliveryDone =
    destinationDone &&
    (sameRecipient ||
      RECIPIENT_FIELDS.every((field) => Boolean(values[field]?.trim())));
  const checklist: Array<[string, boolean]> = [
    [t.customerHeading, clientDone],
    [t.itemsHeading, lines.length > 0],
    [t.addressHeading, deliveryDone],
  ];

  return (
    <form
      onSubmit={submit}
      className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3"
      noValidate
    >
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
        <Section number={1} title={t.customerHeading} id={CUSTOMER_ANCHOR}>
          <Tabs
            value={customerMode}
            onValueChange={(value) =>
              form.setValue(
                "customerMode",
                value as CreateOrderFormValues["customerMode"],
              )
            }
          >
            <TabsList aria-label={t.modeAria}>
              <TabsTrigger value={CUSTOMER_MODE.GUEST}>
                {t.modeGuest}
              </TabsTrigger>
              <TabsTrigger value={CUSTOMER_MODE.ACCOUNT}>
                {t.modeAccount}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {customerMode === CUSTOMER_MODE.ACCOUNT ? (
            <OrderCustomerPicker
              selected={customer}
              onSelect={selectCustomer}
              onClear={clearCustomer}
              error={errors.userId?.message}
            />
          ) : null}
          {/* TASK-2398: «Імʼя» and «Прізвище» are two fields in both modes —
              the client block is what «той самий клієнт» sends as the
              recipient, so a missing surname is said HERE. */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <PhoneField
              name="contactPhone"
              label={t.contactPhone}
              maxLength={CONTACT_PHONE_MAX_LENGTH}
              form={form}
            />
            <Field
              name="contactFirstName"
              label={t.contactName}
              maxLength={ADDRESS_LIMITS.name}
              form={form}
            />
            <Field
              name="contactLastName"
              label={t.contactLastName}
              maxLength={ADDRESS_LIMITS.name}
              form={form}
            />
            {customerMode === CUSTOMER_MODE.GUEST ? (
              <Field
                name="contactEmail"
                label={t.contactEmail}
                type="email"
                hint={t.contactEmailOptional}
                maxLength={EMAIL_MAX_LENGTH}
                form={form}
              />
            ) : null}
          </div>
        </Section>

        <Section
          number={2}
          title={t.itemsHeading}
          id={ITEMS_ANCHOR}
          invalid={itemsMissing}
        >
          <OrderLinePicker
            lines={lines}
            lineErrors={refusal?.lines}
            onChange={(next) => {
              setLines(next);
              setLinesTouched(true);
              // A line the server refused is fixed by changing it.
              if (refusal && Object.keys(refusal.lines).length) {
                setRefusal({ ...refusal, lines: {} });
              }
            }}
          />
          {itemsMissing ? (
            <p role="alert" className="text-sm text-destructive">
              {t.itemsEmpty}
            </p>
          ) : null}
        </Section>

        <Section number={3} title={t.addressHeading}>
          <PillGroup
            label={t.deliveryMethodAria}
            value={deliveryMethod}
            onChange={chooseDeliveryMethod}
            options={offeredMethods.map((method) => ({
              value: method,
              label: METHOD_LABELS[method] ?? method,
            }))}
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id="order-create-same-recipient"
              checked={sameRecipient}
              onCheckedChange={(checked) =>
                toggleSameRecipient(checked === true)
              }
            />
            <Label htmlFor="order-create-same-recipient">
              {t.sameRecipient}
            </Label>
          </div>
          {sameRecipient ? null : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field
                name="firstName"
                label={t.addressFirstName}
                maxLength={ADDRESS_LIMITS.name}
                form={form}
              />
              <Field
                name="lastName"
                label={t.addressLastName}
                maxLength={ADDRESS_LIMITS.name}
                form={form}
              />
              <PhoneField
                name="phone"
                label={t.addressPhone}
                maxLength={ADDRESS_LIMITS.phone}
                form={form}
              />
            </div>
          )}
          {deliveryMethod === "NOVA_POSHTA" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <NpCityField form={form} idPrefix="order-create" />
              <NpWarehouseField form={form} idPrefix="order-create" />
              <Field
                name="postalCode"
                label={t.addressPostalCode}
                maxLength={ADDRESS_LIMITS.postalCode}
                form={form}
              />
            </div>
          ) : deliveryMethod === "PICKUP" ? (
            <PickupField form={form} points={pickupPoints} />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                name="city"
                label={t.addressCity}
                maxLength={ADDRESS_LIMITS.city}
                form={form}
              />
              <Field
                name="address1"
                label={t.addressAddress1}
                maxLength={ADDRESS_LIMITS.address1}
                form={form}
              />
              <Field
                name="postalCode"
                label={t.addressPostalCode}
                maxLength={ADDRESS_LIMITS.postalCode}
                form={form}
              />
              {deliveryMethod === "OTHER" ? (
                <Field
                  name="shippingCost"
                  label={t.shippingCostLabel}
                  hint={t.shippingCostHint}
                  inputMode="decimal"
                  form={form}
                />
              ) : null}
            </div>
          )}
          {sameRecipient ? (
            <p className="text-xs text-muted-foreground">
              {t.sameRecipientHint}
            </p>
          ) : null}
        </Section>

        <Section number={4} title={t.paymentHeading}>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">
              {t.paymentMethod}
            </span>
            <PillGroup
              label={t.paymentMethodAria}
              value={values.paymentMethod}
              onChange={(value) =>
                form.setValue("paymentMethod", value, {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
              options={Object.values(CreateManualOrderDtoPaymentMethod).map(
                (method) => {
                  const blocked = !allowedPayments.includes(method);
                  return {
                    value: method,
                    label: PAYMENT_METHOD_LABELS[method] ?? method,
                    disabled: blocked,
                    describedBy: blocked ? PAYMENT_REASON_ID : undefined,
                  };
                },
              )}
            />
            {Object.values(CreateManualOrderDtoPaymentMethod).some(
              (method) => !allowedPayments.includes(method),
            ) ? (
              <p
                id={PAYMENT_REASON_ID}
                className="text-xs text-muted-foreground"
              >
                {t.paymentNotForMethod}
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <NoteField
              id="order-create-notes"
              name="notes"
              label={t.notes}
              placeholder={t.notesPlaceholder}
              max={NOTES_MAX_LENGTH}
              form={form}
            />
            <NoteField
              id="order-create-internal-notes"
              name="internalNotes"
              label={t.internalNotes}
              placeholder={t.internalNotesPlaceholder}
              hint={dict.orders.internalNotesHint}
              max={INTERNAL_NOTES_MAX_LENGTH}
              form={form}
            />
          </div>
        </Section>
      </div>

      {/* «Підсумок» — sticky beside the form from lg, last on a phone. */}
      <aside
        aria-labelledby="order-create-summary"
        className="flex flex-col gap-3 rounded-lg border border-border p-4 lg:sticky lg:top-20"
      >
        <h3
          id="order-create-summary"
          className="text-sm font-semibold text-foreground"
        >
          {t.summaryHeading}
        </h3>

        {errorLinks.length ? (
          <FormAlert>
            <p className="font-semibold">
              {t.errorsTitle(countLabel(errorLinks.length, t.fieldForms))}
            </p>
            <p className="mt-1 flex flex-wrap gap-x-2.5 gap-y-1">
              {errorLinks.map((link) => (
                <a
                  key={link.id + link.label}
                  href={`#${link.id}`}
                  onClick={(event) => {
                    const target = document.getElementById(link.id);
                    if (!target) return;
                    event.preventDefault();
                    target.scrollIntoView({ block: "center" });
                    target.focus({ preventScroll: true });
                  }}
                  className="rounded-xs underline outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {link.label}
                </a>
              ))}
            </p>
          </FormAlert>
        ) : null}

        {refusal?.summary ? (
          <FormAlert>
            <p className="font-semibold">{t.serverErrorTitle}</p>
            <p className="mt-1">{refusal.summary}</p>
          </FormAlert>
        ) : null}

        <dl className="flex flex-col gap-1.5 text-sm">
          <SummaryRow
            label={t.summaryPositions}
            value={t.summaryPositionsValue(quantity)}
          />
          <SummaryRow label={t.summaryGoods} value={formatCurrency(goods)} />
          <SummaryRow label={t.summaryDelivery} value={deliveryValue} />
          <Separator className="my-1" />
          <div className="flex items-center justify-between font-semibold text-foreground">
            <dt>{t.summaryTotal}</dt>
            <dd className="tabular-nums">
              {formatCurrency(
                (Math.round(goods * 100) + Math.round(shipping * 100)) / 100,
              )}
            </dd>
          </div>
        </dl>

        <ul
          aria-label={t.summaryChecklistAria}
          className="flex flex-col gap-1.5"
        >
          {checklist.map(([label, done]) => (
            <li
              key={label}
              className={cn(
                "flex items-center gap-2 text-sm",
                done ? "text-success" : "text-muted-foreground",
              )}
            >
              {done ? (
                <CircleCheckIcon aria-hidden="true" className="size-4" />
              ) : (
                <CircleIcon aria-hidden="true" className="size-4" />
              )}
              {label}
              {done ? (
                <span className="sr-only">{`, ${dict.canon.stepDone}`}</span>
              ) : null}
            </li>
          ))}
        </ul>

        <Button
          type="submit"
          className="w-full"
          disabled={createOrder.isPending}
        >
          {t.submit}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => router.back()}
        >
          {t.cancel}
        </Button>
      </aside>
    </form>
  );
}

/** A numbered section of the form (Н1): «① Клієнт». */
function Section({
  number,
  title,
  id,
  invalid = false,
  children,
}: {
  number: number;
  title: string;
  id?: string;
  invalid?: boolean;
  children: ReactNode;
}) {
  const headingId = `order-create-section-${number}`;
  return (
    <section
      id={id}
      tabIndex={id ? -1 : undefined}
      aria-labelledby={headingId}
      className={cn(
        "flex scroll-mt-20 flex-col gap-4 rounded-lg border p-4 outline-none md:p-5",
        invalid ? "border-destructive" : "border-border",
      )}
    >
      <h3
        id={headingId}
        className="flex items-center gap-2.5 text-base font-semibold text-foreground"
      >
        <span
          aria-hidden="true"
          className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
        >
          {number}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-muted-foreground">
      <dt>{label}</dt>
      <dd className="text-right text-foreground tabular-nums">{value}</dd>
    </div>
  );
}

/** «Замовлення створено» + the one-time buyer link (TASK-484). */
function OrderCreated({
  created,
  onOpen,
}: {
  created: { id: string; accessUrl: string | null; emailed: boolean };
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex max-w-3xl flex-col gap-4 rounded-lg border border-border p-6">
      <h3 className="text-base font-semibold text-foreground">
        {t.createdHeading}
      </h3>
      <p className="font-mono text-sm text-muted-foreground">
        {t.createdNumber(created.id.slice(0, 8).toUpperCase())}
      </p>

      {created.accessUrl ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-foreground">{t.createdLinkIntro}</p>
          {/* Selectable text, not only a copy button: `navigator.clipboard`
              refuses on an insecure origin. */}
          <p
            aria-label={dict.orderAccess.linkAria}
            className="rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-all text-foreground select-all"
          >
            {created.accessUrl}
          </p>
          <CopyButton
            value={created.accessUrl}
            label={dict.orderAccess.copy}
            copiedLabel={dict.orderAccess.copied}
            failedLabel={dict.orderAccess.copyFailed}
            ariaLabel={dict.orderAccess.copyAria}
          />
          <p className="text-xs font-medium text-warning">
            {t.createdLinkOnce}
          </p>
          {created.emailed && (
            <p className="text-xs text-muted-foreground">
              {t.createdEmailSent}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t.createdLinkUnavailable}
        </p>
      )}

      <Button
        type="button"
        className="self-start"
        onClick={() => onOpen(created.id)}
      >
        {t.createdOpenOrder}
      </Button>
    </div>
  );
}

/**
 * A note with its limit (TASK-794; Н3 «Не більше 2000 символів — зараз N»).
 * `maxLength` stops the typing; the error explains a refusal that still gets
 * through, and says how far over it is.
 */
function NoteField({
  id,
  name,
  label,
  placeholder,
  hint,
  max,
  form,
}: {
  id: string;
  name: "notes" | "internalNotes";
  label: string;
  placeholder: string;
  hint?: string;
  max: number;
  form: CreateForm;
}) {
  const error = form.formState.errors[name];
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = `${id}-error`;
  const length = form.getValues(name)?.length ?? 0;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        rows={3}
        maxLength={max}
        placeholder={placeholder}
        aria-describedby={
          [hintId, error ? errorId : null].filter(Boolean).join(" ") ||
          undefined
        }
        aria-invalid={error ? true : undefined}
        {...form.register(name)}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error.message}
          {length > max ? <span> {t.tooLongNow(length)}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One labelled phone field (TASK-426; TASK-1984 Rule 5b): `PhoneInput` with
 * the INTERNATIONAL rule — both endpoints are `@IsInternationalPhone`
 * (TASK-338), so there is no `+380` mask (it rewrote foreign numbers into a
 * different Ukrainian one); the input only drops characters no phone has.
 */
function PhoneField({
  name,
  label,
  maxLength,
  form,
}: {
  name: "phone" | "contactPhone";
  label: string;
  maxLength: number;
  form: CreateForm;
}) {
  const id = `order-create-${name}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>{label}</Label>
          <PhoneInput
            id={id}
            rule="international"
            autoComplete="off"
            maxLength={maxLength}
            aria-describedby={
              [hintId, fieldState.error ? errorId : null]
                .filter(Boolean)
                .join(" ") || undefined
            }
            aria-invalid={fieldState.error ? true : undefined}
            ref={field.ref}
            name={field.name}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
          />
          <p id={hintId} className="text-xs text-muted-foreground">
            {t.phoneHint}
          </p>
          {fieldState.error ? (
            <p id={errorId} role="alert" className="text-xs text-destructive">
              {fieldState.error.message}
            </p>
          ) : null}
        </div>
      )}
    />
  );
}

/**
 * The pickup point of a pickup order (TASK-1973): cards of the shop's active
 * points instead of address fields — the parcel is collected there.
 */
function PickupField({
  form,
  points,
}: {
  form: CreateForm;
  points: ComponentProps<typeof PickupPointPicker>["points"];
}) {
  const id = "order-create-pickupPointId";
  const labelId = `${id}-label`;
  const errorId = `${id}-error`;
  const error = form.formState.errors.pickupPointId;
  const value = useWatch({ control: form.control, name: "pickupPointId" });

  if (points.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t.deliveryPickupNone}</p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-sm font-medium text-foreground">
        {t.deliveryPickupLabel}
      </span>
      <PickupPointPicker
        id={id}
        points={points}
        value={value}
        onChange={(pointId) =>
          form.setValue("pickupPointId", pointId, {
            shouldValidate: true,
            shouldDirty: true,
          })
        }
        labelledBy={labelId}
        errorId={errorId}
        invalid={Boolean(error)}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}

/** One labelled text input wired to RHF, with its error and optional hint. */
function Field({
  name,
  label,
  form,
  type = "text",
  placeholder,
  hint,
  inputMode,
  maxLength,
}: {
  name: Exclude<keyof CreateOrderFormValues, "sameRecipient">;
  label: string;
  form: CreateForm;
  type?: string;
  placeholder?: string;
  hint?: string;
  inputMode?: "decimal";
  /** The DTO's `@MaxLength` (Rule 5d) — the schema carries the same `.max`. */
  maxLength?: number;
}) {
  const error = form.formState.errors[name];
  const id = `order-create-${name}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        maxLength={maxLength}
        autoComplete="off"
        placeholder={placeholder}
        aria-describedby={
          [hintId, error ? errorId : null].filter(Boolean).join(" ") ||
          undefined
        }
        aria-invalid={error ? true : undefined}
        {...form.register(name)}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
