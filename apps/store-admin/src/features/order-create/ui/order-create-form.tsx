"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CreateManualOrderDtoPaymentMethod,
  getAdminOrderControllerFindAllQueryKey,
  useAdminOrderControllerCreate,
} from "@/entities/order";
import {
  Button,
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
} from "../model/create-order-schema";
import { OrderLinePicker } from "./order-line-picker";

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
          toast.success(dict.orderCreate.success);
          router.push(`/orders/${response.data.id}`);
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
          <Field
            name="userId"
            label={dict.orderCreate.userId}
            placeholder={dict.orderCreate.userIdPlaceholder}
            hint={dict.orderCreate.userIdHint}
            form={form}
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
              form={form}
            />
            <Field
              name="contactPhone"
              label={dict.orderCreate.contactPhone}
              type="tel"
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
          <Field
            name="phone"
            label={dict.orderCreate.addressPhone}
            type="tel"
            form={form}
          />
          <Field name="city" label={dict.orderCreate.addressCity} form={form} />
          <Field
            name="address1"
            label={dict.orderCreate.addressAddress1}
            form={form}
          />
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
