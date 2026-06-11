"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateOrder, type CreateOrderDto } from "@/entities/order";
import { getGetCartQueryKey } from "@/entities/cart";
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

  const mutation = useCreateOrder({
    mutation: {
      onSuccess: (res) => {
        const orderId = res?.data?.id;
        queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
        router.push(orderId ? `/orders/${orderId}/confirmation` : "/");
      },
    },
  });

  const submitOrder = (values: CheckoutFormValues) => {
    const dto: CreateOrderDto = {
      shippingAddress: values.shippingAddress,
      billingAddress: values.billingSameAsShipping
        ? undefined
        : values.billingAddress,
      notes: values.notes || undefined,
    };
    mutation.mutate({ data: dto });
  };

  const status = mutation.error?.response?.status;
  const errorMessage =
    status === 400
      ? "Some items may no longer be available. Please review your cart."
      : mutation.isError
        ? "Something went wrong. Please try again."
        : null;

  return {
    submitOrder,
    isPending: mutation.isPending,
    isError: mutation.isError,
    errorMessage,
  };
}
