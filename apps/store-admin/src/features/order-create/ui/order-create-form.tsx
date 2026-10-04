"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
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
import { dict } from "@/shared/config";
import { cn, countLabel, formatCurrency } from "@/shared/lib";
import {
  CREATE_ORDER_DEFAULTS,
  CUSTOMER_MODE,
  INTERNAL_NOTES_MAX_LENGTH,
  NOTES_MAX_LENGTH,
  createOrderSchema,
  createOrderValuesToDto,
  type CreateOrderFormValues,
  type DraftLine,
  type PickedCustomer,
} from "../model/create-order-schema";
import {
  readCreateOrderRefusal,
  type CreateOrderRefusal,
} from "../model/create-order-error";
import { OrderLinePicker } from "./order-line-picker";
import { OrderCustomerPicker } from "./order-customer-picker";
import { NpCityField, NpWarehouseField } from "./np-address-fields";

const t = dict.orderCreate;

type CreateForm = UseFormReturn<CreateOrderFormValues>;

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  [CreateManualOrderDtoPaymentMethod.ON_DELIVERY]: t.methodOnDelivery,
  [CreateManualOrderDtoPaymentMethod.ONLINE]: t.methodOnline,
  [CreateManualOrderDtoPaymentMethod.INSTALLMENTS]: t.methodInstallments,
};

/** Recipient fields the «той самий клієнт» checkbox hides and fills. */
const RECIPIENT_FIELDS = ["firstName", "lastName", "phone"] as const;

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
  ["contactName", t.contactName],
  ["contactEmail", t.contactEmail],
];
const REST_FIELDS: ReadonlyArray<[keyof CreateOrderFormValues, string]> = [
  ["firstName", t.addressFirstName],
  ["lastName", t.addressLastName],
  ["phone", t.addressPhone],
  ["city", t.addressCity],
  ["address1", t.addressAddress1],
  ["postalCode", t.addressPostalCode],
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
  sameRecipient: boolean,
): ErrorLink[] {
  // While the recipient IS the client, its fields are hidden and their errors
  // are the client's — listed once, under the client.
  const hidden: readonly string[] = sameRecipient ? RECIPIENT_FIELDS : [];
  const links = (fields: typeof CLIENT_FIELDS) =>
    fields
      .filter(([name]) => errors[name] && !hidden.includes(name))
      .map(([name, label]) => ({ id: anchorOf(name), label }));
  return [
    ...links(CLIENT_FIELDS),
    ...(itemsMissing ? [{ id: ITEMS_ANCHOR, label: t.itemsHeading }] : []),
    ...links(REST_FIELDS),
  ];
}

/** First word → first name, the rest → last name: «Оксана Шевченко». */
function splitName(full: string): { firstName: string; lastName: string } {
  const [first = "", ...rest] = full.trim().split(/\s+/);
  return { firstName: first, lastName: rest.join(" ") };
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
 * «Одержувач — той самий клієнт» is on by default: the recipient's name and
 * phone are then copied from the client at submit time — split from the
 * guest's name, or taken from the picked account. If that copy would leave a
 * required recipient field empty (a one-word name, an account with no phone),
 * the checkbox turns itself off so the fields and their errors are on screen.
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
  const [sameRecipient, setSameRecipient] = useState(true);
  const [refusal, setRefusal] = useState<CreateOrderRefusal | null>(null);
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

  /**
   * Record the picked account, and fill the recipient block from it — only
   * EMPTY fields: "send it to my sister" is a normal instruction.
   */
  const selectCustomer = (picked: PickedCustomer) => {
    setCustomer(picked);
    form.setValue("userId", picked.id, { shouldValidate: true });

    const prefill = (
      field: "firstName" | "lastName" | "phone",
      value: string,
    ) => {
      if (value !== "" && form.getValues(field) === "") {
        form.setValue(field, value);
      }
    };

    prefill("firstName", picked.firstName);
    prefill("lastName", picked.lastName);
    prefill("phone", picked.phone);
  };

  const clearCustomer = () => {
    setCustomer(null);
    form.setValue("userId", "");
  };

  /** «Той самий клієнт»: copy the client into the recipient before validating. */
  const copyRecipientFromClient = () => {
    const current = form.getValues();
    const source =
      current.customerMode === CUSTOMER_MODE.ACCOUNT
        ? {
            firstName: customer?.firstName ?? "",
            lastName: customer?.lastName ?? "",
            phone: customer?.phone ?? "",
          }
        : {
            ...splitName(current.contactName),
            phone: current.contactPhone,
          };
    for (const field of RECIPIENT_FIELDS) {
      form.setValue(field, source[field]);
    }
  };

  const onValid = (formValues: CreateOrderFormValues) => {
    // Checked AFTER the schema, not instead of it: «Додайте хоча б один товар»
    // and the field errors are shown together (Н2).
    if (lines.length === 0) return;

    setRefusal(null);
    createOrder.mutate(
      { data: createOrderValuesToDto(formValues, lines) },
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
            emailed: formValues.contactEmail.trim() !== "",
          });
        },
        onError: (error) => {
          // TASK-957 / Н3: a 400 is placed where it can be fixed — under the
          // line or the field it names; the box in «Підсумок» says what
          // happened. The toast stays for the operator looking elsewhere.
          const placed = readCreateOrderRefusal(error, lines);
          if (placed) {
            setRefusal(placed);
            for (const [field, message] of Object.entries(placed.fields)) {
              form.setError(field as "notes" | "internalNotes", {
                type: "server",
                message,
              });
            }
            toast.error(placed.summary);
            return;
          }
          toast.error(t.failed);
        },
      },
    );
  };

  const onInvalid = (errors: FieldErrors<CreateOrderFormValues>) => {
    // An error on a field the checkbox hides is an error nobody can see — but
    // while the CLIENT is itself wrong, that error is the client's, already on
    // screen, and the checkbox stays (Н2).
    const clientInvalid =
      form.getValues("customerMode") === CUSTOMER_MODE.ACCOUNT
        ? Boolean(errors.userId)
        : Boolean(errors.contactName || errors.contactPhone);
    if (
      sameRecipient &&
      !clientInvalid &&
      RECIPIENT_FIELDS.some((field) => errors[field])
    ) {
      setSameRecipient(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    setSubmitted(true);
    setLinesTouched(true);
    if (sameRecipient) copyRecipientFromClient();
    return form.handleSubmit(onValid, onInvalid)(event);
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
  const errorLinks = submitted
    ? errorLinksOf(errors, itemsMissing, sameRecipient)
    : [];

  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const goods =
    lines.reduce(
      (sum, line) => sum + Math.round(Number(line.price) * 100) * line.quantity,
      0,
    ) / 100;

  const clientDone =
    customerMode === CUSTOMER_MODE.ACCOUNT
      ? Boolean(values.userId)
      : Boolean(values.contactName?.trim() && values.contactPhone?.trim());
  const deliveryDone =
    Boolean(values.city?.trim() && values.address1?.trim()) &&
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
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <PhoneField
                name="contactPhone"
                label={t.contactPhone}
                form={form}
              />
              <Field name="contactName" label={t.contactName} form={form} />
              <Field
                name="contactEmail"
                label={t.contactEmail}
                type="email"
                hint={t.contactEmailOptional}
                form={form}
              />
            </div>
          )}
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
          <div className="flex items-center gap-2">
            <Checkbox
              id="order-create-same-recipient"
              checked={sameRecipient}
              onCheckedChange={(checked) => setSameRecipient(checked === true)}
            />
            <Label htmlFor="order-create-same-recipient">
              {t.sameRecipient}
            </Label>
          </div>
          {sameRecipient ? null : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field name="firstName" label={t.addressFirstName} form={form} />
              <Field name="lastName" label={t.addressLastName} form={form} />
              <PhoneField name="phone" label={t.addressPhone} form={form} />
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <NpCityField form={form} />
            <NpWarehouseField form={form} />
            <Field name="postalCode" label={t.addressPostalCode} form={form} />
          </div>
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
              onChange={(value) => form.setValue("paymentMethod", value)}
              options={Object.values(CreateManualOrderDtoPaymentMethod).map(
                (method) => ({
                  value: method,
                  label: PAYMENT_METHOD_LABELS[method] ?? method,
                }),
              )}
            />
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

        {refusal ? (
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
          <SummaryRow
            label={t.summaryDelivery}
            value={t.summaryDeliveryValue}
          />
          <Separator className="my-1" />
          <div className="flex items-center justify-between font-semibold text-foreground">
            <dt>{t.summaryTotal}</dt>
            <dd className="tabular-nums">{formatCurrency(goods)}</dd>
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
 * One labelled phone field: a PLAIN input and the rule underneath (TASK-426).
 * No `+380` mask: the endpoints accept any country (TASK-338), and the mask
 * rewrote foreign numbers into a different Ukrainian one.
 */
function PhoneField({
  name,
  label,
  form,
}: {
  name: "phone" | "contactPhone";
  label: string;
  form: CreateForm;
}) {
  return (
    <Field
      name={name}
      label={label}
      form={form}
      type="tel"
      hint={t.phoneHint}
    />
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
}: {
  name: keyof CreateOrderFormValues;
  label: string;
  form: CreateForm;
  type?: string;
  placeholder?: string;
  hint?: string;
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
