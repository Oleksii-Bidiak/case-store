"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAdminOrderControllerFindAllQueryKey,
  getAdminOrderControllerFindByIdQueryKey,
  getAdminOrderControllerGetAllowedTransitionsQueryKey,
  isPreShipmentStatus,
  useAdminOrderControllerUpdateDetails,
  type OrderEntity,
} from "@/entities/order";
import {
  orderConflictMessage,
  type ApiErrorLike,
} from "@/features/order-status-update";
import { Button, Input, Label } from "@/shared/ui";
import { dict } from "@/shared/config";
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
 */
export function OrderAddressForm({ order }: OrderAddressFormProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const updateDetails = useAdminOrderControllerUpdateDetails();

  const editable = isPreShipmentStatus(order.status);

  const form = useForm<OrderAddressFormValues>({
    resolver: zodResolver(orderAddressSchema),
    // forms.md Rule 2a — stable entity, and `keepDirtyValues` stops a background
    // refetch from wiping a half-typed correction.
    values: mapOrderToAddressValues(order),
    resetOptions: { keepDirtyValues: true },
  });

  const conflict = orderConflictMessage(updateDetails.error as ApiErrorLike);

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
    updateDetails.mutate(
      {
        orderId: order.id,
        data: {
          shippingAddress: addressValuesToDto(
            values,
            order.shippingAddress as Record<string, unknown> | null,
          ),
          expectedUpdatedAt: order.updatedAt,
        },
      },
      {
        onSuccess: () => {
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

      {conflict ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
        >
          {conflict}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={updateDetails.isPending}>
          {dict.orders.addressSave}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            form.reset(mapOrderToAddressValues(order));
            setEditing(false);
          }}
        >
          {dict.orders.addressEditCancel}
        </Button>
      </div>
    </form>
  );
}
