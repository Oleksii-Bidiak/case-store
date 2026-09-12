"use client";

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getAdminOrderControllerFindAllQueryKey,
  getAdminOrderControllerFindByIdQueryKey,
  getAdminOrderControllerGetAllowedTransitionsQueryKey,
  useAdminOrderControllerUpdateDetails,
  type OrderEntity,
} from "@/entities/order";
import {
  orderConflictMessage,
  type ApiErrorLike,
} from "@/features/order-status-update";
import { Button, Input, Label, Textarea } from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  createOrderDetailsSchema,
  isWaybillRejection,
  mapOrderToDetailsValues,
  orderDetailsValuesToDto,
  type OrderDetailsFormValues,
} from "../model/order-details-schema";

interface OrderDetailsFormProps {
  order: OrderEntity;
}

/**
 * Waybill + internal notes editor for the order detail page (TASK-335 / 336).
 *
 * ── Why the waybill is typed in ─────────────────────────────────────────────
 * Creating one through the Nova Poshta API needs a counterparty registered in
 * the client's own NP account, which is outside what this project can set up —
 * so the number is copied out of the courier's interface. The hint says so, in
 * place of a "Create waybill" button that could not work.
 *
 * ── Why the two note fields are visibly different ───────────────────────────
 * `notes` is what the CUSTOMER typed and is shown back to them; `internalNotes`
 * is the shop talking about the customer. They are rendered as different things
 * — one read-only, one editable, each with a hint naming its audience — because
 * the failure mode of confusing them is a fraud remark arriving in a buyer's
 * inbox (TASK-336).
 *
 * Follows forms.md Rule 2a: `values` + `keepDirtyValues`, so a background
 * refetch refreshes untouched fields without discarding a half-typed waybill.
 *
 * ── The waybill is sent only when it changed (TASK-426) ─────────────────────
 * The API now demands exactly 14 digits. Orders created before that rule carry
 * values which are not — and this form used to PUT the waybill on every save, so
 * such an order answered 400 to a save of its internal notes: a field the
 * operator was editing, refused over a field they never touched. The mapper
 * omits an unchanged waybill, and the schema grandfathers it on screen.
 */
export function OrderDetailsForm({ order }: OrderDetailsFormProps) {
  const queryClient = useQueryClient();
  const updateDetails = useAdminOrderControllerUpdateDetails();

  // What the order carries right now: the seed for the form AND the baseline the
  // mapper compares against, so an untouched waybill is not re-sent. Derived from
  // the prop on every render rather than held in state — there is nothing to fall
  // out of sync (docs/conventions/forms.md).
  const seeded = mapOrderToDetailsValues(order);

  // The waybill rule grandfathers the value the order already had, so a legacy
  // ТТН does not mark the whole form invalid and lock the notes away with it —
  // see `createOrderDetailsSchema`. Memoised only for a stable resolver identity;
  // RHF re-reads its options on every render, so a refetch that changes the
  // waybill still swaps the rule.
  const resolver = useMemo(
    () => zodResolver(createOrderDetailsSchema(seeded.trackingNumber)),
    [seeded.trackingNumber],
  );

  const form = useForm<OrderDetailsFormValues>({
    resolver,
    values: seeded,
    resetOptions: { keepDirtyValues: true },
  });

  // A 400 that names the waybill is a RULE, not a lost update, and must not be
  // reported as one. `orderConflictMessage` keys off any string `error` field in
  // the body, and Nest's validation envelope carries `error: "Bad Request"` — so
  // without this the operator is told their order "changed elsewhere, reload the
  // page" when what actually happened is that they typed the ТТН wrong.
  const conflict = isWaybillRejection(updateDetails.error)
    ? null
    : orderConflictMessage(updateDetails.error as ApiErrorLike);

  const onSubmit = (values: OrderDetailsFormValues) => {
    updateDetails.mutate(
      {
        orderId: order.id,
        data: orderDetailsValuesToDto(values, seeded, order.updatedAt),
      },
      {
        onSuccess: (response) => {
          // Re-seed from the server's answer and drop the dirty flags, so the
          // next background refetch is free to update these fields again.
          form.reset(mapOrderToDetailsValues(response.data));
          void queryClient.invalidateQueries({
            queryKey: getAdminOrderControllerFindByIdQueryKey(order.id),
          });
          // The write moved `updatedAt`, which IS the lock token the status
          // picker holds — refetch it or the operator's next status change is
          // refused as stale by their own edit.
          void queryClient.invalidateQueries({
            queryKey: getAdminOrderControllerGetAllowedTransitionsQueryKey(
              order.id,
            ),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminOrderControllerFindAllQueryKey(),
          });
          toast.success(dict.orders.detailsSaved);
        },
        onError: (error) => {
          // FIRST, for the reason given above `conflict`: the server refused ONE
          // named field, which is neither a conflict nor an unknowable failure.
          // Say which field and which rule — and put the message under the field
          // as well, because the toast will go and the box that needs fixing
          // stays.
          if (isWaybillRejection(error)) {
            form.setError("trackingNumber", {
              type: "server",
              message: dict.orders.trackingNumberInvalid,
            });
            toast.error(dict.orders.detailsFailedTracking);
            return;
          }

          const message = orderConflictMessage(error as ApiErrorLike);
          if (message) {
            void queryClient.invalidateQueries({
              queryKey: getAdminOrderControllerFindByIdQueryKey(order.id),
            });
            toast.error(message);
            return;
          }
          toast.error(dict.orders.detailsFailed);
        },
      },
    );
  };

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-tracking-number">
          {dict.orders.trackingNumber}
        </Label>
        <Input
          id="order-tracking-number"
          inputMode="numeric"
          autoComplete="off"
          placeholder={dict.orders.trackingNumberPlaceholder}
          aria-describedby="order-tracking-number-hint"
          aria-invalid={form.formState.errors.trackingNumber ? true : undefined}
          {...form.register("trackingNumber")}
        />
        <p
          id="order-tracking-number-hint"
          className="text-xs text-muted-foreground"
        >
          {dict.orders.trackingNumberHint}
        </p>
        {form.formState.errors.trackingNumber ? (
          <p role="alert" className="text-xs text-destructive">
            {form.formState.errors.trackingNumber.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-internal-notes">
          {dict.orders.internalNotes}
        </Label>
        <Textarea
          id="order-internal-notes"
          rows={4}
          placeholder={dict.orders.internalNotesPlaceholder}
          aria-describedby="order-internal-notes-hint"
          aria-invalid={form.formState.errors.internalNotes ? true : undefined}
          {...form.register("internalNotes")}
        />
        <p
          id="order-internal-notes-hint"
          className="text-xs text-muted-foreground"
        >
          {dict.orders.internalNotesHint}
        </p>
        {form.formState.errors.internalNotes ? (
          <p role="alert" className="text-xs text-destructive">
            {form.formState.errors.internalNotes.message}
          </p>
        ) : null}
      </div>

      {conflict ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {conflict}
        </p>
      ) : null}

      <div>
        <Button
          type="submit"
          size="sm"
          disabled={updateDetails.isPending || !form.formState.isDirty}
        >
          {dict.orders.detailsSave}
        </Button>
      </div>
    </form>
  );
}
