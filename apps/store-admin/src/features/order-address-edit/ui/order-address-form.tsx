"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getAdminOrderControllerFindAllQueryKey,
  fetchFreshOrder,
  getAdminOrderControllerFindByIdQueryKey,
  getAdminOrderControllerGetAllowedTransitionsQueryKey,
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
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { Button, Input, Label, StaleDraftPanel } from "@/shared/ui";
import { dict } from "@/shared/config";
import { useEditLockToken } from "@/shared/lib/use-edit-lock-token";
import { useStaleDraftReview } from "@/shared/lib/use-stale-draft-review";
import {
  addressValuesToDto,
  mapOrderToAddressValues,
  orderAddressSchema,
  type OrderAddressFormValues,
} from "../model/address-schema";

interface OrderAddressFormProps {
  order: OrderEntity;
}

const FIELDS = [
  { name: "firstName", label: dict.orderCreate.addressFirstName },
  { name: "lastName", label: dict.orderCreate.addressLastName },
  { name: "phone", label: dict.orderCreate.addressPhone, type: "tel" },
  { name: "city", label: dict.orderCreate.addressCity },
  { name: "address1", label: dict.orderCreate.addressAddress1 },
  { name: "postalCode", label: dict.orderCreate.addressPostalCode },
] as const;

/** Field → its label, for the stale-draft review rows (TASK-1972). */
const FIELD_LABELS = Object.fromEntries(
  FIELDS.map((field) => [field.name, field.label]),
) as Record<keyof OrderAddressFormValues, string>;

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
    : orderWriteErrorMessage(updateDetails.error as ApiErrorLike);

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
          shippingAddress: addressValuesToDto(
            values,
            order.shippingAddress as Record<string, unknown> | null,
          ),
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
      {FIELDS.map((field) => {
        const error = form.formState.errors[field.name];
        const id = `order-address-${field.name}`;

        return (
          <div key={field.name} className="flex flex-col gap-1">
            <Label htmlFor={id} className="text-xs">
              {field.label}
            </Label>
            <Input
              id={id}
              type={"type" in field ? field.type : "text"}
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              {...form.register(field.name)}
            />
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error.message}
              </p>
            ) : null}
          </div>
        );
      })}

      {review.review ? (
        <StaleDraftPanel
          rows={review.diverging.map((name) => ({
            name,
            label: FIELD_LABELS[name],
            theirs: review.review?.fresh[name] ?? "",
            mine: draft[name],
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
