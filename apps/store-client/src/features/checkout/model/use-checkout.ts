"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateOrder,
  type CreateOrderDto,
  type OrderEntity,
} from "@/entities/order";
import { getGetCartQueryKey } from "@/entities/cart";
import {
  useAppliedDiscount,
  clearAppliedDiscount,
} from "@/features/apply-discount";
import { dict } from "@/shared/config";
import type { CheckoutFormValues } from "./checkout-schema";
import { requiresPaymentHandoff } from "./payment-methods";
import { checkoutHandoffMessage, useOrderPayment } from "./use-order-payment";

export interface UseCheckoutOptions {
  /**
   * Whether the shopper has no account. Guests supply a `contact` block and stay
   * on this page afterwards, because `GET /api/orders/:id` — and therefore
   * `/orders/[id]/confirmation` — requires a session they do not have.
   */
  isGuest: boolean;
}

/**
 * useCheckout — order creation, cart invalidation, and whatever has to happen
 * next, which is no longer always "push to the confirmation page".
 *
 * ── The three endings ─────────────────────────────────────────────────────────
 * 1. **Cash on delivery, signed in** — create the order, push to
 *    `/orders/[id]/confirmation`. Unchanged behaviour.
 * 2. **Card / instalments** — create the order, then open a payment attempt and
 *    hand the browser to the provider (`useOrderPayment`). This is *how the
 *    chosen method reaches the API*: `CreateOrderDto` carries no payment field,
 *    so the choice is expressed as a second call rather than a property of the
 *    first (docs/payments-liqpay.md §3, steps 2–5).
 * 3. **Guest** — create the order and surface {@link placedOrder} for an in-page
 *    success panel. No redirect: the confirmation route needs a JWT, so pushing a
 *    guest there would show them a login screen seconds after they paid us money.
 *
 * If the handoff itself fails, the order still exists and is still unpaid, so we
 * land on the confirmation page carrying the reason. Nothing anywhere in this
 * flow reports a payment that the server has not confirmed.
 */
export function useCheckout({ isGuest }: UseCheckoutOptions) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Marks that an order was placed and the page is either navigating away or
  // showing its own success panel. Set synchronously the moment the mutation
  // resolves — i.e. before the cart invalidation's async refetch can report an
  // empty cart — so CheckoutView's empty-cart guard already sees `true` and
  // won't fire `router.replace("/cart")` over the top (the TASK-119 race).
  const [isOrderSubmitted, setIsOrderSubmitted] = useState(false);

  // The created order, kept only for the guest success panel (ending 3).
  const [placedOrder, setPlacedOrder] = useState<OrderEntity | null>(null);

  // Set when the order was created but the provider handoff was not. Describes
  // the handoff, never the money.
  const [handoffMessage, setHandoffMessage] = useState<string | null>(null);

  // Applied promo code (TASK-079) — sent as `discountCode`; the server recomputes
  // and persists it authoritatively. Cleared once the order is placed.
  const appliedDiscount = useAppliedDiscount();

  const mutation = useCreateOrder();
  const { startPayment, isStarting } = useOrderPayment();

  const submitOrder = async (values: CheckoutFormValues) => {
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
      discountCode: appliedDiscount?.code || undefined,
      // TASK-338. Sent only for guests: the backend ignores a contact block from
      // an authenticated caller, whose account is the source of truth. Name and
      // phone are reused from the delivery fields rather than asked for twice —
      // they are the same two facts, and the recipient is the person we call.
      ...(isGuest
        ? {
            contact: {
              email: (values.email ?? "").trim(),
              phone: values.phone,
              name: `${values.firstName} ${values.lastName}`.trim(),
            },
          }
        : {}),
    };

    const response = await mutation
      .mutateAsync({ data: dto })
      .catch(() => null);
    const order = response?.data;
    if (!order) return; // `mutation.isError` drives the message.

    setIsOrderSubmitted(true);
    clearAppliedDiscount();
    void queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });

    if (requiresPaymentHandoff(values.paymentMethod)) {
      const failure = await startPayment(order.id);
      // On success the browser is already leaving for the provider's page, so
      // anything after this line only runs when the handoff did NOT happen.
      if (!failure) return;

      setHandoffMessage(checkoutHandoffMessage(failure));
      if (!isGuest) {
        router.push(`/orders/${order.id}/confirmation`);
        return;
      }
      setPlacedOrder(order);
      return;
    }

    if (isGuest) {
      setPlacedOrder(order);
      return;
    }

    router.push(`/orders/${order.id}/confirmation`);
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
    // The submit button stays busy across BOTH calls: an order that is on its way
    // to the provider must not look finished, and must not be submittable twice.
    isPending: mutation.isPending || isStarting,
    isError: mutation.isError,
    errorMessage,
    isOrderSubmitted,
    placedOrder,
    handoffMessage,
  };
}
