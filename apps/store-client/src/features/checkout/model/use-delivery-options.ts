"use client";

import { useGetCart } from "@/entities/cart";
import {
  useEstimateDelivery,
  useGetDeliveryMethods,
} from "@/entities/delivery";
import {
  quoteDelivery,
  toDeliveryOptions,
  type CheckoutDeliveryMethod,
  type CheckoutDeliveryOptions,
  type DeliveryQuote,
} from "./delivery";

/**
 * The shop's delivery offer (TASK-646) — `GET /api/delivery/methods` through
 * the generated hook, normalised. Every caller shares one React Query entry, so
 * the view, the review step and the order summary never disagree.
 *
 * `isLoading` gates the checkout skeleton: rendering the form before the list
 * arrives would draw Nova Poshta fields for a shop that only does pickup.
 */
export function useDeliveryOptions(): {
  options: CheckoutDeliveryOptions;
  isLoading: boolean;
} {
  const { data, isLoading } = useGetDeliveryMethods();
  return { options: toDeliveryOptions(data?.data), isLoading };
}

export interface DeliverySelection {
  method: CheckoutDeliveryMethod;
  /** The Nova Poshta manual path (TASK-1097) — see `bookedDeliveryMethod`. */
  npManual?: boolean;
  /** Drives the live Nova Poshta estimate (TASK-080). */
  npCityRef?: string;
}

/**
 * What delivery costs for the current selection — {@link quoteDelivery} fed
 * with the cached cart (courier threshold), the delivery options (courier
 * price) and the live Nova Poshta estimate. The estimate only runs for Nova
 * Poshta proper: a courier or a pickup order has no use for it.
 */
export function useDeliveryQuote({
  method,
  npManual = false,
  npCityRef,
}: DeliverySelection): {
  quote: DeliveryQuote;
  isEstimating: boolean;
} {
  const { options } = useDeliveryOptions();
  const cartQuery = useGetCart();
  const wantsEstimate =
    method === "NOVA_POSHTA" && !npManual && Boolean(npCityRef);

  const {
    data: estimateData,
    isFetching: isEstimating,
    // TASK-402: a failed estimate and a zero-cost one say the same honest thing
    // — an operator will confirm the cost.
    isError: isEstimateError,
  } = useEstimateDelivery(
    { cityRef: npCityRef ?? "" },
    { query: { enabled: wantsEstimate } },
  );

  const quote = quoteDelivery({
    method,
    npManual,
    npCityRef,
    courier: options.courier,
    subtotal: cartQuery.data?.data?.totals?.subtotal,
    estimate: estimateData?.data,
    isEstimating: wantsEstimate && isEstimating,
    isEstimateError,
  });

  return { quote, isEstimating: wantsEstimate && isEstimating };
}
