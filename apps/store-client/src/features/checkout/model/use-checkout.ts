"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateOrder, type CreateOrderDto } from "@/entities/order";
import { getGetCartQueryKey } from "@/entities/cart";
import { dict } from "@/shared/config";
import type { CheckoutFormValues } from "./checkout-schema";

/**
 * useCheckout — encapsulates order creation via the generated `useCreateOrder`
 * mutation, cart cache invalidation, and the redirect to the confirmation page.
 *
 * The backend empties the cart when the order is created, so on success we
 * invalidate the cart query to keep every cart-bound view in sync, then navigate
 * to `/orders/[id]/confirmation` (a stub route filled in by TASK-036).
 */
export function useCheckout() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Marks that an order was placed and we are navigating to the confirmation
  // page. Set synchronously in onSuccess — i.e. before the cart invalidation's
  // async refetch can report an empty cart — so CheckoutView's empty-cart guard
  // already sees `true` and won't fire `router.replace("/cart")`, overwriting our
  // pending push to the confirmation page (the TASK-119 redirect race).
  const [isOrderSubmitted, setIsOrderSubmitted] = useState(false);

  const mutation = useCreateOrder({
    mutation: {
      onSuccess: (res) => {
        const orderId = res?.data?.id;
        setIsOrderSubmitted(true);
        queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
        router.push(orderId ? `/orders/${orderId}/confirmation` : "/");
      },
    },
  });

  const submitOrder = (values: CheckoutFormValues) => {
    const dto: CreateOrderDto = {
      shippingAddress: {
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone,
        city: values.city,
        // The delivery address / Nova Poshta branch maps to address1; country is
        // fixed to UA. NP refs (TASK-080) are sent when the user picked from the
        // autocomplete; omitted for the free-text fallback.
        address1: values.deliveryAddress,
        country: "UA",
        npCityRef: values.npCityRef || undefined,
        npWarehouseRef: values.npWarehouseRef || undefined,
        npWarehouseName: values.npWarehouseRef
          ? values.deliveryAddress
          : undefined,
      },
      notes: values.notes || undefined,
    };
    mutation.mutate({ data: dto });
  };

  const status = mutation.error?.response?.status;
  const errorMessage =
    status === 400
      ? dict.checkout.error400
      : mutation.isError
        ? dict.common.genericError
        : null;

  return {
    submitOrder,
    isPending: mutation.isPending,
    isError: mutation.isError,
    errorMessage,
    isOrderSubmitted,
  };
}
