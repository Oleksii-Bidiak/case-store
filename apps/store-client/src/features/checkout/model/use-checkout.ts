"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateOrder,
  type CreateOrderDto,
  type CreatedOrderEntity,
  type OrderEntity,
} from "@/entities/order";
import { getGetCartQueryKey } from "@/entities/cart";
import { getGetDeliveryMethodsQueryKey } from "@/entities/delivery";
import { useAppliedDiscount, clearAppliedDiscount } from "@/entities/discount";
import { dict } from "@/shared/config";
import { apiErrorCode, apiErrorMessage, apiErrorStatus } from "@/shared/lib";
import type { CheckoutFormValues } from "./checkout-schema";
import {
  requiresPaymentHandoff,
  toOrderPaymentMethod,
} from "./payment-methods";
import { checkoutHandoffMessage, useOrderPayment } from "./use-order-payment";
import {
  courierAddressLine,
  courierCity,
  type CheckoutDeliveryOptions,
} from "./delivery";
import { useDeliveryOptions } from "./use-delivery-options";

type DeliveryPayload = Pick<
  CreateOrderDto,
  "shippingAddress" | "deliveryMethod" | "pickupPointId"
>;

/**
 * The delivery half of `CreateOrderDto`, by method (TASK-646). Country is fixed
 * to UA; the server recomputes the shipping cost from the method and never
 * takes a price from the client.
 *
 *   - Nova Poshta — the city and branch, with the NP refs from the autocomplete.
 *   - Nova Poshta, directory down (TASK-1097) — the typed city and address with
 *     NO `deliveryMethod` and NO `npCityRef`: the server infers OTHER from that
 *     and accepts it even when «інша доставка» is switched off, because the
 *     shopper never chose it. Sending NOVA_POSHTA would be refused (no ref).
 *   - Pickup — the point id, plus the point's own city and address: `AddressDto`
 *     still requires both, and the server overwrites them with its snapshot.
 *   - Courier — the courier's city and «вулиця, буд, кв. N» as `address1`.
 *   - Other — the typed city and the free-text address / carrier.
 */
export function toDeliveryPayload(
  values: CheckoutFormValues,
  options: CheckoutDeliveryOptions,
): DeliveryPayload {
  const recipient = {
    firstName: values.firstName,
    lastName: values.lastName,
    phone: values.phone,
    country: "UA",
  };

  switch (values.deliveryMethod) {
    case "PICKUP": {
      const point = options.pickupPoints.find(
        (candidate) => candidate.id === values.pickupPointId,
      );
      return {
        deliveryMethod: "PICKUP",
        pickupPointId: values.pickupPointId,
        shippingAddress: {
          ...recipient,
          city: point?.city ?? values.city,
          address1: point?.address ?? point?.name ?? values.deliveryAddress,
        },
      };
    }
    case "COURIER":
      return {
        deliveryMethod: "COURIER",
        shippingAddress: {
          ...recipient,
          // The shop's city, or the one typed when it named none — never an
          // empty string, which `AddressDto` refuses with a 400.
          city: courierCity(options.courier.cityName, values.courierCity),
          address1: courierAddressLine(values),
        },
      };
    case "OTHER":
      return {
        deliveryMethod: "OTHER",
        shippingAddress: {
          ...recipient,
          city: values.city,
          address1: values.deliveryAddress,
        },
      };
    case "NOVA_POSHTA":
    default:
      if (values.npManual) {
        return {
          shippingAddress: {
            ...recipient,
            city: values.city,
            address1: values.deliveryAddress,
          },
        };
      }
      return {
        deliveryMethod: "NOVA_POSHTA",
        shippingAddress: {
          ...recipient,
          city: values.city,
          address1: values.deliveryAddress,
          npCityRef: values.npCityRef || undefined,
          npWarehouseRef: values.npWarehouseRef || undefined,
          npWarehouseName: values.npWarehouseRef
            ? values.deliveryAddress
            : undefined,
        },
      };
  }
}

/** How an order attempt ended — see `submitOrder`. */
export type SubmitOrderOutcome = "placed" | "refused" | "failed";

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
 *    hand the browser to the provider (`useOrderPayment`). The method itself
 *    already travelled on the first call as `CreateOrderDto.paymentMethod` —
 *    that is what makes the server stamp the 30-minute stock reservation
 *    (TASK-650); the second call only opens the payment attempt
 *    (docs/payments-liqpay.md §3, steps 2–5).
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

  // The guest's own order access token (TASK-679) — the one the confirmation
  // e-mail carries, returned ONCE by the create call. It is the guest's proof
  // of ownership for the Telegram routes on the success panel. Memory only, on
  // purpose: never localStorage / sessionStorage — it opens the order.
  const [guestAccessToken, setGuestAccessToken] = useState<string | null>(null);

  // Set when the order was created but the provider handoff was not. Describes
  // the handoff, never the money.
  const [handoffMessage, setHandoffMessage] = useState<string | null>(null);

  // Applied promo code (TASK-079) — sent as `discountCode`; the server recomputes
  // and persists it authoritatively. Cleared once the order is placed.
  const appliedDiscount = useAppliedDiscount();

  const mutation = useCreateOrder();
  const { startPayment, isStarting } = useOrderPayment();
  // The pickup point's address and the courier's city (TASK-646) — the same
  // cached `GET /api/delivery/methods` the form was drawn from.
  const { options: deliveryOptions } = useDeliveryOptions();

  /**
   * Place the order, and say how it went:
   *
   *   - `placed`  — created; one of the three endings above followed.
   *   - `refused` — a 400: the server named what it will not accept (a delivery
   *                 method or point switched off, a product gone). The caller
   *                 takes the shopper back to step 1, where the reason is shown
   *                 and the delivery can be changed (CheckoutDelivery.dc.html
   *                 #error).
   *   - `failed`  — anything else (network, 5xx, an expired session): nothing
   *                 the shopper entered is wrong, so they stay put and retry.
   */
  const submitOrder = async (
    values: CheckoutFormValues,
  ): Promise<SubmitOrderOutcome> => {
    const dto: CreateOrderDto = {
      ...toDeliveryPayload(values, deliveryOptions),
      notes: values.notes || undefined,
      // TASK-650. Always sent, ON_DELIVERY included: without it the server
      // stores its default ON_DELIVERY for a card order too, so the order never
      // gets `reservationExpiresAt` and its stock is never released if unpaid.
      paymentMethod: toOrderPaymentMethod(values.paymentMethod),
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

    // `mutation.isError` drives the message; this only decides where it shows.
    let order: CreatedOrderEntity | undefined;
    try {
      order = (await mutation.mutateAsync({ data: dto }))?.data;
    } catch (error) {
      // A refusal over the delivery (`DELIVERY_*`, TASK-643) usually means the
      // shop changed its offer after this page loaded — a method or a pickup
      // point switched off. Refetch the offer, so the picker the shopper
      // returns to no longer proposes what was just refused.
      if (apiErrorCode(error)?.startsWith("DELIVERY_")) {
        void queryClient.invalidateQueries({
          queryKey: getGetDeliveryMethodsQueryKey(),
        });
      }
      return apiErrorStatus(error) === 400 ? "refused" : "failed";
    }
    if (!order) return "failed";

    setIsOrderSubmitted(true);
    clearAppliedDiscount();
    void queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });

    if (requiresPaymentHandoff(values.paymentMethod)) {
      const failure = await startPayment(order.id);
      // On success the browser is already leaving for the provider's page, so
      // anything after this line only runs when the handoff did NOT happen.
      if (!failure) return "placed";

      setHandoffMessage(checkoutHandoffMessage(failure));
      if (!isGuest) {
        router.push(`/orders/${order.id}/confirmation`);
        return "placed";
      }
      setGuestAccessToken(order.guestAccessToken ?? null);
      setPlacedOrder(order);
      return "placed";
    }

    if (isGuest) {
      setGuestAccessToken(order.guestAccessToken ?? null);
      setPlacedOrder(order);
      return "placed";
    }

    router.push(`/orders/${order.id}/confirmation`);
    return "placed";
  };

  // A 400 from `createOrder` is never generic: it names the exact line that
  // blocked the order — a product withdrawn from sale, or one whose stock no
  // longer covers the quantity (`order.service.ts`, the checkout backstop).
  // Collapsing that into "деякі товари можуть бути недоступні" leaves the
  // shopper to guess which of eight items to remove (TASK-402), so the server's
  // own sentence wins whenever it wrote one; the constant remains the fallback.
  const status = apiErrorStatus(mutation.error);
  const errorMessage =
    status === 400
      ? (apiErrorMessage(mutation.error) ?? dict.checkout.error400)
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
    /** Forget a shown refusal — the shopper has moved on to try again. */
    clearError: mutation.reset,
    isOrderSubmitted,
    placedOrder,
    /** The guest's order access token from the create call; `null` otherwise. */
    guestAccessToken,
    handoffMessage,
  };
}
