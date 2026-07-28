// Payment entity — re-exports the generated payment types and API hooks
// (FSD entities layer). Upper layers (features/widgets) import payment data
// access from here, never from the generated client directly.
//
// The storefront's whole payment surface is one call: open an attempt and get
// back a signed handoff. Everything that decides money — signature verification,
// the provider status map, idempotency — lives server-side and reaches the
// storefront only as an order's `paymentStatus` (docs/payments-liqpay.md §4).
export type {
  PaymentCheckoutEntity,
  PaymentCheckoutEntityFields,
  PaymentCheckoutEntityMethod,
  PaymentCheckoutResponse,
} from "@/shared/api/generated/models";

export {
  usePaymentControllerCreateCheckout,
  paymentControllerCreateCheckout,
} from "@/shared/api/generated/payments/payments";
