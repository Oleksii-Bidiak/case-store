"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getAdminOrderControllerFindAllQueryKey,
  fetchFreshOrder,
  getAdminOrderControllerFindByIdQueryKey,
  getAdminOrderControllerGetAllowedTransitionsQueryKey,
  getAdminOrderMoneyControllerGetQueryKey,
  isPreShipmentStatus,
  useAdminOrderControllerUpdateDetails,
  type OrderEntity,
} from "@/entities/order";
import {
  ORDER_STALE_REVIEW_LABELS,
  isStaleWriteConflict,
  orderConflictMessage,
  orderWriteErrorMessage,
  type ApiErrorLike,
} from "@/features/order-status-update";
import {
  PickupPointPicker,
  useGetDeliveryMethods,
  type DeliveryMethod,
} from "@/entities/delivery";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { Button, Input, Label, PillGroup, StaleDraftPanel } from "@/shared/ui";
import { apiErrorCode, apiErrorMessage } from "@/shared/lib";
import { dict } from "@/shared/config";
import { useEditLockToken } from "@/shared/lib/use-edit-lock-token";
import { useStaleDraftReview } from "@/shared/lib/use-stale-draft-review";
import {
  DELIVERY_METHODS,
  deliveryEditToDto,
  mapOrderToAddressValues,
  orderAddressSchema,
  type OrderAddressFormValues,
} from "../model/address-schema";

interface OrderAddressFormProps {
  order: OrderEntity;
}

/** The recipient — on every delivery method. */
const CONTACT_FIELDS = [
  { name: "firstName", label: dict.orderCreate.addressFirstName },
  { name: "lastName", label: dict.orderCreate.addressLastName },
  { name: "phone", label: dict.orderCreate.addressPhone, type: "tel" },
] as const;

/** Where the parcel goes — on every method but pickup (TASK-1806). */
const ADDRESS_FIELDS = [
  { name: "city", label: dict.orderCreate.addressCity },
  { name: "address1", label: dict.orderCreate.addressAddress1 },
  { name: "postalCode", label: dict.orderCreate.addressPostalCode },
] as const;

/** «Інша доставка» only (AD-ORD-86). */
const COST_FIELD = {
  name: "shippingCost",
  label: dict.orderCreate.shippingCostLabel,
  hint: dict.orders.deliveryOtherCostHint,
} as const;

/** «Нова Пошта», «Самовивіз», «Курʼєр», «Інша доставка». */
const METHOD_LABELS = dict.orders.deliveryMethodLabels as Record<
  string,
  string
>;

/**
 * Field → its label, for the stale-draft review rows (TASK-1972) — the method,
 * the point and the agreed cost included (TASK-1973).
 */
const FIELD_LABELS: Record<keyof OrderAddressFormValues, string> = {
  ...(Object.fromEntries(
    [...CONTACT_FIELDS, ...ADDRESS_FIELDS].map((field) => [
      field.name,
      field.label,
    ]),
  ) as Record<string, string>),
  deliveryMethod: dict.orders.deliveryMethodLabel,
  pickupPointId: dict.orderCreate.deliveryPickupLabel,
  shippingCost: dict.orderCreate.shippingCostLabel,
} as Record<keyof OrderAddressFormValues, string>;

/** A DELIVERY_* refusal is worded for the operator — shown as it came. */
function deliveryRefusalOf(error: unknown): string | null {
  return apiErrorCode(error)?.startsWith("DELIVERY_")
    ? (apiErrorMessage(error) ?? null)
    : null;
}

/**
 * Correct the delivery address before the parcel ships (TASK-341).
 *
 * Once the order has SHIPPED the control is not merely disabled, it is replaced
 * by a sentence explaining why: the address on the waybill is the one that
 * counts from that moment, and editing the order afterwards would only make our
 * record disagree with the parcel's. A greyed-out button invites the operator to
 * keep clicking; a reason ends the question.
 *
 * Writes through the same optimistic lock as every other order edit, so a
 * colleague's concurrent change is refused rather than silently overwritten.
 *
 * Not rendered at all without `orders:write` (TASK-715): the address itself is
 * already on the card above this control, and «Змінити адресу» would only open
 * a form whose save answers 403.
 */
export function OrderAddressForm({ order }: OrderAddressFormProps) {
  const { can } = useAuth();
  if (!can(PERM.ordersWrite)) return null;
  return <OrderAddressEditor order={order} />;
}

function OrderAddressEditor({ order }: OrderAddressFormProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const updateDetails = useAdminOrderControllerUpdateDetails();

  const editable = isPreShipmentStatus(order.status);
  const seeded = mapOrderToAddressValues(order);

  const form = useForm<OrderAddressFormValues>({
    resolver: zodResolver(orderAddressSchema),
    // forms.md Rule 2a — stable entity, and `keepDirtyValues` stops a background
    // refetch from wiping a half-typed correction.
    values: seeded,
    resetOptions: { keepDirtyValues: true },
  });

  // TASK-629: the card polls, so `order.updatedAt` moves while the operator
  // types. Send the version they started editing, or a colleague's save that
  // landed meanwhile is overwritten without a 409 — see `useEditLockToken`.
  // `dirtyFields`, not `isDirty`: a values-driven reset drops `isDirty` for a
  // render even though the typed text is kept, which would let go of the token.
  // `seeded` rides along as the base the stale-draft review compares against.
  const lock = useEditLockToken(
    Object.keys(form.formState.dirtyFields).length > 0,
    order.updatedAt,
    seeded,
  );

  const draft: OrderAddressFormValues = {
    ...seeded,
    ...useWatch({ control: form.control }),
  };

  const offer = useGetDeliveryMethods({ query: { enabled: editing } }).data
    ?.data;

  // TASK-1972 (AD-ORD-105): after a 409 the colleague's address is shown field
  // by field next to the draft; the token moves only on the operator's word.
  const review = useStaleDraftReview<OrderAddressFormValues>({
    draft,
    apply: (field, value) => form.resetField(field, { defaultValue: value }),
    rebase: (version, fresh) => lock.rebase(version, fresh),
  });

  // The edit is over — cancelled, saved, or the parcel left pre-shipment: a
  // colleague's version still on its way must not open a panel over the next,
  // pristine edit (`close` also disowns the pending fetch).
  const active = editing && editable;
  const closeReview = review.close;
  useEffect(() => {
    if (!active) closeReview();
  }, [active, closeReview]);

  // 409 → conflict sentence, 403 → «немає права» (TASK-622). A 400 is neither:
  // it used to read as «замовлення змінилося», because any coded body counted.
  // A stale refusal whose fresh version could not be fetched has its own line:
  // the remedy is «Зберегти» again, there is no «Оновити» to point at.
  const conflict = review.fetchFailed
    ? dict.orderStatus.staleReviewFetchFailed
    : (deliveryRefusalOf(updateDetails.error) ??
      orderWriteErrorMessage(updateDetails.error as ApiErrorLike));

  // TASK-1973: what the shop offers — read once the form opens. The order's
  // own method stays on offer even if the owner has switched it off since;
  // Nova Poshta is offered only to an NP order: moving to it needs a city from
  // the NP directory, which this form does not have.
  const offerMethods = offer?.methods ?? [];
  const methodOptions = DELIVERY_METHODS.filter(
    (method) =>
      method === seeded.deliveryMethod ||
      (method !== "NOVA_POSHTA" && offerMethods.includes(method)),
  );
  const npUnreachable =
    seeded.deliveryMethod !== "NOVA_POSHTA" &&
    offerMethods.includes("NOVA_POSHTA");
  const pickupPoints = offer?.pickupPoints ?? [];
  const pickedPoint = pickupPoints.find(
    (point) => point.id === draft.pickupPointId,
  );
  // The delivery × payment matrix for the order's own payment (TASK-1021):
  // a card order cannot become «Інша доставка». BANK_TRANSFER fits every row.
  // A payload without a method means the column default, cash on delivery.
  const payment = order.paymentMethod ?? "ON_DELIVERY";
  const paymentFits = (method: DeliveryMethod) =>
    payment === "BANK_TRANSFER" ||
    !offer?.paymentMatrix ||
    (offer.paymentMatrix[method] as readonly string[]).includes(payment);
  const method = draft.deliveryMethod;

  /** A review row's value as the operator reads it — a name, not a code. */
  const display = (
    name: keyof OrderAddressFormValues,
    value: string,
  ): string => {
    if (name === "deliveryMethod") return METHOD_LABELS[value] ?? value;
    if (name === "pickupPointId") {
      return pickupPoints.find((point) => point.id === value)?.name ?? value;
    }
    return value;
  };

  if (!editable) {
    return (
      <p className="text-xs text-muted-foreground">
        {dict.orders.addressLockedHint}
      </p>
    );
  }

  if (!editing) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setEditing(true)}
      >
        {dict.orders.addressEdit}
      </Button>
    );
  }

  const onSubmit = (values: OrderAddressFormValues) => {
    // A new attempt: drop a «could not fetch» line left by the previous one.
    review.close();
    updateDetails.mutate(
      {
        orderId: order.id,
        data: {
          // TASK-1973: the address, plus the method / point / agreed cost
          // when they change — the server rebuilds the snapshot (TASK-1020).
          ...deliveryEditToDto(values, order, pickedPoint),
          expectedUpdatedAt: lock.token,
        },
      },
      {
        onSuccess: (response) => {
          // Drop the dirty flags (and with them the held lock token), so the
          // next edit starts from the saved address and the version it made.
          // `keepDirtyValues: false` overrides the form-level reset option,
          // which would otherwise keep the very flags this reset drops.
          form.reset(mapOrderToAddressValues(response.data), {
            keepDirtyValues: false,
          });
          lock.rebase(response.data.updatedAt);
          void queryClient.invalidateQueries({
            queryKey: getAdminOrderControllerFindByIdQueryKey(order.id),
          });
          // The write moved `updatedAt`, which is also the status picker's lock
          // token — refetch it, or the operator's next status change is refused
          // as stale by their own edit.
          void queryClient.invalidateQueries({
            queryKey: getAdminOrderControllerGetAllowedTransitionsQueryKey(
              order.id,
            ),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminOrderControllerFindAllQueryKey(),
          });
          // A new shipping cost moved the total and the balance (AD-ORD-86).
          void queryClient.invalidateQueries({
            queryKey: getAdminOrderMoneyControllerGetQueryKey(order.id),
          });
          setEditing(false);
          toast.success(dict.orders.addressSaved);
        },
        onError: (error) => {
          const message = orderConflictMessage(error as ApiErrorLike);
          if (isStaleWriteConflict(error as ApiErrorLike)) {
            // TASK-1972: fetch the colleague's version and review it next to
            // the draft — never rebase the token here, before the operator has
            // seen it (that is how the second save overwrote the colleague).
            // The refusal is answered by the panel, or by the inline «save
            // again» line if the fetch fails — never by a toast on top.
            const base = lock.base;
            updateDetails.reset();
            const pending = review.begin();
            void fetchFreshOrder(queryClient, order.id)
              .then((fresh) =>
                pending.open({
                  base,
                  draft: form.getValues(),
                  fresh: mapOrderToAddressValues(fresh),
                  version: fresh.updatedAt,
                }),
              )
              .catch(() => pending.fail());
            return;
          }
          if (message) {
            toast.error(message);
            return;
          }
          // A DELIVERY_* refusal is shown under the form, where it is fixed.
          if (deliveryRefusalOf(error)) return;
          toast.error(
            orderWriteErrorMessage(error as ApiErrorLike) ??
              dict.orders.detailsFailed,
          );
        },
      },
    );
  };

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-3"
      noValidate
    >
      {methodOptions.length > 1 ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-foreground">
            {dict.orders.deliveryMethodLabel}
          </span>
          <PillGroup
            label={dict.orderCreate.deliveryMethodAria}
            value={method}
            onChange={(next) => {
              form.setValue("deliveryMethod", next, { shouldDirty: true });
              form.clearErrors([
                "city",
                "address1",
                "pickupPointId",
                "shippingCost",
              ]);
            }}
            options={methodOptions.map((option) => ({
              value: option,
              label: METHOD_LABELS[option] ?? option,
              disabled:
                option !== seeded.deliveryMethod && !paymentFits(option),
            }))}
          />
          {npUnreachable ? (
            <p className="text-xs text-muted-foreground">
              {dict.orders.deliveryEditNoNp}
            </p>
          ) : null}
        </div>
      ) : null}

      {CONTACT_FIELDS.map((field) => (
        <TextField key={field.name} field={field} form={form} />
      ))}

      {method === "PICKUP" ? (
        <PickupField form={form} points={pickupPoints} />
      ) : (
        ADDRESS_FIELDS.map((field) => (
          <TextField key={field.name} field={field} form={form} />
        ))
      )}

      {method === "OTHER" ? (
        <TextField field={COST_FIELD} form={form} inputMode="decimal" />
      ) : null}

      {review.review ? (
        <StaleDraftPanel
          rows={review.diverging.map((name) => ({
            name,
            label: FIELD_LABELS[name],
            theirs: display(name, review.review?.fresh[name] ?? ""),
            mine: display(name, draft[name]),
          }))}
          labels={ORDER_STALE_REVIEW_LABELS}
          onTakeTheirs={(name) =>
            review.takeTheirs(name as keyof OrderAddressFormValues)
          }
          onAcknowledge={review.acknowledge}
        />
      ) : conflict ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
        >
          {conflict}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={updateDetails.isPending || review.pending}
          aria-describedby={
            review.pending ? "order-address-save-hint" : undefined
          }
        >
          {dict.orders.addressSave}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            form.reset(mapOrderToAddressValues(order), {
              keepDirtyValues: false,
            });
            setEditing(false);
          }}
        >
          {dict.orders.addressEditCancel}
        </Button>
      </div>
      {review.pending ? (
        <p
          id="order-address-save-hint"
          className="text-xs text-muted-foreground"
        >
          {dict.orderStatus.staleReviewSaveHint}
        </p>
      ) : null}
    </form>
  );
}

type AddressForm = ReturnType<typeof useForm<OrderAddressFormValues>>;

/** One labelled input of the edit, with its error and optional hint. */
function TextField({
  field,
  form,
  inputMode,
}: {
  field: {
    name: keyof OrderAddressFormValues;
    label: string;
    type?: string;
    hint?: string;
  };
  form: AddressForm;
  inputMode?: "decimal";
}) {
  const error = form.formState.errors[field.name];
  const id = `order-address-${field.name}`;
  const hintId = field.hint ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs">
        {field.label}
      </Label>
      <Input
        id={id}
        type={field.type ?? "text"}
        inputMode={inputMode}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={hintId}
        {...form.register(field.name)}
      />
      {field.hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {field.hint}
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

/**
 * The point of a pickup order (TASK-1806): the shop's active points instead of
 * address fields — the snapshot's address IS the point's, and editing it as
 * text would rewrite what the buyer was promised.
 */
function PickupField({
  form,
  points,
}: {
  form: AddressForm;
  points: ComponentProps<typeof PickupPointPicker>["points"];
}) {
  const id = "order-address-pickupPointId";
  const labelId = `${id}-label`;
  const errorId = `${id}-error`;
  const error = form.formState.errors.pickupPointId;
  const value = useWatch({ control: form.control, name: "pickupPointId" });

  return (
    <div className="flex flex-col gap-1">
      <span id={labelId} className="text-xs font-medium text-foreground">
        {dict.orderCreate.deliveryPickupLabel}
      </span>
      {points.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {dict.orderCreate.deliveryPickupNone}
        </p>
      ) : (
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
      )}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
