"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  CreateManualOrderDtoPaymentMethod,
  getAdminOrderControllerFindAllQueryKey,
  useAdminOrderControllerCreate,
} from "@/entities/order";
import { getAdminDashboardControllerGetNeedsActionQueryKey } from "@/entities/dashboard";
import {
  Button,
  CopyButton,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  CREATE_ORDER_DEFAULTS,
  CUSTOMER_MODE,
  createOrderSchema,
  createOrderValuesToDto,
  type CreateOrderFormValues,
  type DraftLine,
  type PickedCustomer,
} from "../model/create-order-schema";
import { OrderLinePicker } from "./order-line-picker";
import { OrderCustomerPicker } from "./order-customer-picker";
import { NpCityField, NpWarehouseField } from "./np-address-fields";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  [CreateManualOrderDtoPaymentMethod.ON_DELIVERY]: "Оплата при отриманні",
  [CreateManualOrderDtoPaymentMethod.ONLINE]: "Картка онлайн",
  [CreateManualOrderDtoPaymentMethod.INSTALLMENTS]: "Оплата частинами",
};

/**
 * Create an order on the customer's behalf — a phone order (TASK-341).
 *
 * This is a CREATE form, not an edit form, so forms.md Rule 2 does not bite:
 * there is no async entity to seed from and nothing to re-sync.
 *
 * The picked lines are local state rather than RHF fields because they are a
 * list of objects with their own add/remove/quantity semantics, and threading
 * them through the resolver would buy validation this form does not need — the
 * only rule is "at least one", which is checked at submit.
 */
export function OrderCreateForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const createOrder = useAdminOrderControllerCreate();

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [linesTouched, setLinesTouched] = useState(false);
  // The chosen account's display data (TASK-426). Local state, not a form field:
  // only its `id` is ever sent, and a copy of the customer's name in the payload
  // would be a second source of truth for something the server already holds.
  // It lives HERE rather than inside the picker because the picker unmounts every
  // time the operator switches to the «за телефоном» tab.
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  // TASK-484: the created order plus its ONE-TIME buyer link. Local state, never
  // cached: a one-shot secret that survived a navigation would not be one-shot.
  const [created, setCreated] = useState<{
    id: string;
    accessUrl: string | null;
    emailed: boolean;
  } | null>(null);

  const form = useForm<CreateOrderFormValues>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: CREATE_ORDER_DEFAULTS,
  });

  // `useWatch` rather than `form.watch` — see the note in ReturnResolveForm: the
  // latter is not memoization-safe, and subscribing by name avoids re-rendering
  // this large form on every keystroke in an unrelated field.
  const customerMode = useWatch({
    control: form.control,
    name: "customerMode",
  });
  const paymentMethod = useWatch({
    control: form.control,
    name: "paymentMethod",
  });

  /**
   * Record the picked account, and fill the recipient block from it.
   *
   * Only EMPTY fields are filled: the operator is talking to the customer, so
   * "send it to my sister" is a normal instruction and overwriting what they have
   * already typed would fight them. Nothing is watched or re-synced afterwards —
   * this is a one-off effect of an explicit click, not async data seeding
   * (forms.md Rule 1 is about the latter).
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

  const onSubmit = (values: CreateOrderFormValues) => {
    if (lines.length === 0) {
      setLinesTouched(true);
      return;
    }

    createOrder.mutate(
      { data: createOrderValuesToDto(values, lines) },
      {
        onSuccess: (response) => {
          void queryClient.invalidateQueries({
            queryKey: getAdminOrderControllerFindAllQueryKey(),
          });
          // TASK-400: the order is created PENDING, which is precisely what the
          // needs-action widget and the sidebar badge count (`newOrders` in
          // `dashboard.repository.ts`). Without this the operator takes a phone
          // order and the "new orders" badge still shows the old number.
          //
          // The per-order keys (detail, history, transitions) are deliberately
          // NOT invalidated here: this id did not exist a moment ago, so there is
          // nothing cached under it that could be stale.
          void queryClient.invalidateQueries({
            queryKey: getAdminDashboardControllerGetNeedsActionQueryKey(),
          });
          toast.success(dict.orderCreate.success);
          // TASK-484: DO NOT navigate yet. `meta.accessUrl` is the buyer's link
          // and this response is the only place it will ever exist — the server
          // stored just its SHA-256. Pushing straight to the order card would
          // throw it away, and the operator (still on the phone with the buyer)
          // would have to issue a second link to replace one they never saw.
          setCreated({
            id: response.data.id,
            accessUrl: response.meta.accessUrl,
            emailed: values.contactEmail.trim() !== "",
          });
        },
        onError: (error) => {
          const status = (error as { response?: { status?: number } })?.response
            ?.status;
          // 400 covers "no customer identified", "product unavailable" and
          // "stock is short" — all things the operator can act on, so they get a
          // sentence naming those, not a generic failure.
          toast.error(
            status === 400
              ? dict.orderCreate.failedBadRequest
              : dict.orderCreate.failed,
          );
        },
      },
    );
  };

  // TASK-484: the order exists; what is left is the one thing that cannot be
  // done later — handing the buyer their link. The form is replaced rather than
  // decorated, so there is no half-submitted form to re-submit by reflex.
  if (created) {
    const d = dict.orderCreate;
    return (
      <div className="flex max-w-3xl flex-col gap-4 rounded-md border border-border p-6">
        <h3 className="text-base font-semibold text-foreground">
          {d.createdHeading}
        </h3>
        <p className="font-mono text-sm text-muted-foreground">
          {d.createdNumber(created.id.slice(0, 8).toUpperCase())}
        </p>

        {created.accessUrl ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-foreground">{d.createdLinkIntro}</p>
            {/* Selectable text, not only a copy button: `navigator.clipboard`
                refuses on an insecure origin, and an operator on a staging box
                must still be able to select the URL by hand. */}
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
              {d.createdLinkOnce}
            </p>
            {created.emailed && (
              <p className="text-xs text-muted-foreground">
                {d.createdEmailSent}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {d.createdLinkUnavailable}
          </p>
        )}

        <Button
          type="button"
          className="self-start"
          onClick={() => router.push(`/orders/${created.id}`)}
        >
          {d.createdOpenOrder}
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex max-w-3xl flex-col gap-8"
      noValidate
    >
      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-foreground">
          {dict.orderCreate.customerHeading}
        </h3>

        <Tabs
          value={customerMode}
          onValueChange={(value) =>
            form.setValue(
              "customerMode",
              value as CreateOrderFormValues["customerMode"],
            )
          }
        >
          <TabsList aria-label={dict.orderCreate.modeAria}>
            <TabsTrigger value={CUSTOMER_MODE.GUEST}>
              {dict.orderCreate.modeGuest}
            </TabsTrigger>
            <TabsTrigger value={CUSTOMER_MODE.ACCOUNT}>
              {dict.orderCreate.modeAccount}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {customerMode === CUSTOMER_MODE.ACCOUNT ? (
          <OrderCustomerPicker
            selected={customer}
            onSelect={selectCustomer}
            onClear={clearCustomer}
            error={form.formState.errors.userId?.message}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field
              name="contactName"
              label={dict.orderCreate.contactName}
              form={form}
            />
            <Field
              name="contactEmail"
              label={dict.orderCreate.contactEmail}
              type="email"
              hint={dict.orderCreate.contactEmailOptional}
              form={form}
            />
            <PhoneField
              name="contactPhone"
              label={dict.orderCreate.contactPhone}
              form={form}
            />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-foreground">
          {dict.orderCreate.addressHeading}
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            name="firstName"
            label={dict.orderCreate.addressFirstName}
            form={form}
          />
          <Field
            name="lastName"
            label={dict.orderCreate.addressLastName}
            form={form}
          />
          <PhoneField
            name="phone"
            label={dict.orderCreate.addressPhone}
            form={form}
          />
          <NpCityField form={form} />
          <NpWarehouseField form={form} />
          <Field
            name="postalCode"
            label={dict.orderCreate.addressPostalCode}
            form={form}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-foreground">
          {dict.orderCreate.itemsHeading}
        </h3>
        <OrderLinePicker
          lines={lines}
          onChange={(next) => {
            setLines(next);
            setLinesTouched(true);
          }}
        />
        {linesTouched && lines.length === 0 ? (
          <p role="alert" className="text-xs text-destructive">
            {dict.orderCreate.itemsEmpty}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-foreground">
          {dict.orderCreate.paymentHeading}
        </h3>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="order-payment-method">
            {dict.orderCreate.paymentMethod}
          </Label>
          <Select
            value={paymentMethod}
            onValueChange={(value) => form.setValue("paymentMethod", value)}
          >
            <SelectTrigger
              id="order-payment-method"
              className="w-64"
              aria-label={dict.orderCreate.paymentMethodAria}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(CreateManualOrderDtoPaymentMethod).map(
                (method) => (
                  <SelectItem key={method} value={method}>
                    {PAYMENT_METHOD_LABELS[method] ?? method}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="order-create-notes">{dict.orderCreate.notes}</Label>
          <Textarea
            id="order-create-notes"
            rows={2}
            placeholder={dict.orderCreate.notesPlaceholder}
            {...form.register("notes")}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="order-create-internal-notes">
            {dict.orderCreate.internalNotes}
          </Label>
          <Textarea
            id="order-create-internal-notes"
            rows={2}
            placeholder={dict.orderCreate.internalNotesPlaceholder}
            aria-describedby="order-create-internal-notes-hint"
            {...form.register("internalNotes")}
          />
          <p
            id="order-create-internal-notes-hint"
            className="text-xs text-muted-foreground"
          >
            {dict.orders.internalNotesHint}
          </p>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={createOrder.isPending}>
          {dict.orderCreate.submit}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {dict.orderCreate.cancel}
        </Button>
      </div>
    </form>
  );
}

/**
 * One labelled phone field: a PLAIN input, the rule, and the rule written out
 * underneath (TASK-426, revised after review).
 *
 * ── Why no `+380` mask ───────────────────────────────────────────────────────
 * It shipped with one — `PhoneInput` — and that was the bug. `formatUAPhone`
 * rewrites every value into a Ukrainian shape and truncates at nine local digits,
 * so `+48 22 123 4567` became `+380 48 221 2345`: a different number, silently,
 * for a customer the shop can legitimately have. The endpoints behind these two
 * fields accept any country by the owner's standing decision (TASK-338, restated
 * 2026-09-10), so the field must too.
 *
 * `register` rather than `<Controller>` follows from that: with no mask to
 * re-render there is nothing to control, and the raw value the operator typed is
 * exactly what we send. The API normalises it (`normalizePhone`, TASK-466).
 *
 * It is therefore an ordinary {@link Field} with `type="tel"` and the rule as its
 * hint — kept as a named component so the two phone fields cannot drift apart,
 * and so the next reader finds this note instead of re-adding the mask.
 */
function PhoneField({
  name,
  label,
  form,
}: {
  name: "phone" | "contactPhone";
  label: string;
  form: ReturnType<typeof useForm<CreateOrderFormValues>>;
}) {
  return (
    <Field
      name={name}
      label={label}
      form={form}
      type="tel"
      hint={dict.orderCreate.phoneHint}
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
  form: ReturnType<typeof useForm<CreateOrderFormValues>>;
  type?: string;
  placeholder?: string;
  hint?: string;
}) {
  const error = form.formState.errors[name];
  const id = `order-create-${name}`;
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        autoComplete="off"
        placeholder={placeholder}
        aria-describedby={hintId}
        aria-invalid={error ? true : undefined}
        {...form.register(name)}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
