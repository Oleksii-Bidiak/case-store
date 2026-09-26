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
  orderWriteErrorMessage,
  type ApiErrorLike,
} from "@/features/order-status-update";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { Button, Input, Label, Textarea } from "@/shared/ui";
import { dict } from "@/shared/config";
import { useEditLockToken } from "@/shared/lib/use-edit-lock-token";
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
 *
 * ── Without `orders:write` it is not a form (TASK-715) ────────────────────────
 * The PATCH answers 403 to anyone else, so inputs and «Зберегти» would only be a
 * way to lose typing. A read-only operator still needs the waybill to answer the
 * phone, so the two values are shown as text instead.
 *
 * Neither branch renders while the grant set is still loading: `can()` answers
 * false in that window for everyone, and choosing the text view on it flashed a
 * read-only card at every writer (the owner too) before swapping in the form.
 */
export function OrderDetailsForm({ order }: OrderDetailsFormProps) {
  const { can, arePermissionsLoading } = useAuth();
  if (arePermissionsLoading) return null;
  if (!can(PERM.ordersWrite)) return <OrderDetailsReadOnly order={order} />;
  return <OrderDetailsEditor order={order} />;
}

/** The same two values, as text — for a session that may read but not write. */
function OrderDetailsReadOnly({ order }: OrderDetailsFormProps) {
  const { trackingNumber, internalNotes } = mapOrderToDetailsValues(order);
  return (
    <dl className="flex flex-col gap-3 text-sm">
      <div className="flex flex-col gap-1">
        <dt className="font-medium text-foreground">
          {dict.orders.trackingNumber}
        </dt>
        <dd className="text-muted-foreground">
          {trackingNumber || dict.orders.detailsValueEmpty}
        </dd>
      </div>
      <div className="flex flex-col gap-1">
        <dt className="font-medium text-foreground">
          {dict.orders.internalNotes}
        </dt>
        <dd className="flex flex-col gap-1">
          <span className="whitespace-pre-wrap text-muted-foreground">
            {internalNotes || dict.orders.detailsValueEmpty}
          </span>
          <span className="text-xs text-muted-foreground">
            {dict.orders.internalNotesHint}
          </span>
        </dd>
      </div>
    </dl>
  );
}

function OrderDetailsEditor({ order }: OrderDetailsFormProps) {
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

  // TASK-629: the card polls, so `order.updatedAt` moves while the operator
  // types. Send the version they started editing, or a colleague's save that
  // landed meanwhile is overwritten without a 409 — see `useEditLockToken`.
  // `dirtyFields`, not `isDirty`: a values-driven reset drops `isDirty` for a
  // render even though the typed text is kept, which would let go of the token.
  const lock = useEditLockToken(
    Object.keys(form.formState.dirtyFields).length > 0,
    order.updatedAt,
  );

  // A 409 conflict or a 403 «немає права» (TASK-622). A 400 — the waybill rule
  // included — is neither and yields null: the conflict check is gated on the
  // status now, so the old `isWaybillRejection` carve-out here is gone.
  const conflict = orderWriteErrorMessage(updateDetails.error as ApiErrorLike);

  const onSubmit = (values: OrderDetailsFormValues) => {
    updateDetails.mutate(
      {
        orderId: order.id,
        data: orderDetailsValuesToDto(values, seeded, lock.token),
      },
      {
        onSuccess: (response) => {
          // Re-seed from the server's answer and drop the dirty flags, so the
          // next background refetch is free to update these fields again.
          // `keepDirtyValues: false` overrides the form-level reset option:
          // with it, this reset would keep the dirty flags it means to drop
          // (and with them the held lock token — TASK-629).
          form.reset(mapOrderToDetailsValues(response.data), {
            keepDirtyValues: false,
          });
          lock.rebase(response.data.updatedAt);
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
          // FIRST: the server refused ONE named field, which is neither a
          // conflict nor an unknowable failure.
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
            // The operator has now been told the order changed; the refetch
            // refreshes the fields they did not touch. Their next save is made
            // over THAT version, so it becomes the held token (TASK-629) —
            // otherwise every retry would send the refused one again.
            const key = getAdminOrderControllerFindByIdQueryKey(order.id);
            void queryClient
              .invalidateQueries({ queryKey: key })
              .then(() =>
                lock.rebase(
                  queryClient.getQueryData<{ data?: OrderEntity }>(key)?.data
                    ?.updatedAt,
                ),
              );
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
