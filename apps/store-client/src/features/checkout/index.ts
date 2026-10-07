// Checkout feature — address + contact fields, order creation, the provider
// payment handoff, and the validation schema.
export { CheckoutAddressForm } from "./ui/checkout-address-form";
export { CheckoutContactFields } from "./ui/checkout-contact-fields";
export { CheckoutReviewStep } from "./ui/checkout-review-step";
export { CheckoutConsent } from "./ui/checkout-consent";
export { useCheckout } from "./model/use-checkout";
export { useCheckoutPrefill } from "./model/use-checkout-prefill";
export { useCheckoutSteps } from "./model/use-checkout-steps";
export {
  checkoutSchema,
  checkoutSchemaFor,
  guestCheckoutSchema,
  CHECKOUT_DEFAULT_VALUES,
  type CheckoutFormValues,
} from "./model/checkout-schema";

// Delivery methods (TASK-646): the shop's offer, the method card, what the
// chosen delivery costs.
export { DeliveryMethodPicker } from "./ui/delivery-method-picker";
export {
  useDeliveryOptions,
  useDeliveryQuote,
  type DeliverySelection,
} from "./model/use-delivery-options";
export {
  CHECKOUT_DELIVERY_METHODS,
  DEFAULT_DELIVERY_METHOD,
  bookedDeliveryMethod,
  centsToMoney,
  deliveryMethodShortTitle,
  deliveryMethodTitle,
  deliveryQuoteText,
  resolveDeliveryMethod,
  toCents,
  type CheckoutDeliveryMethod,
  type CheckoutDeliveryOptions,
  type DeliveryQuote,
} from "./model/delivery";

// Payment-method vocabulary + availability rules (TASK-330-B).
export {
  CHECKOUT_PAYMENT_METHODS,
  DEFAULT_PAYMENT_METHOD,
  coercePaymentMethod,
  parseConfiguredMethods,
  paymentMethodTitle,
  readConfiguredMethods,
  requiresPaymentHandoff,
  resolvePaymentMethods,
  type CheckoutPaymentMethod,
  type DeliveryPaymentContext,
  type PaymentMethodBlocker,
  type PaymentMethodOption,
} from "./model/payment-methods";

// Provider handoff — used by checkout for the first attempt and by the order
// confirmation page to open a fresh one after a decline.
export {
  useOrderPayment,
  retryHandoffMessage,
  checkoutHandoffMessage,
  type PaymentStartFailure,
} from "./model/use-order-payment";
export { submitPaymentHandoff } from "./lib/payment-handoff";

// What an order screen says about the money, and the callback wait behind it
// (TASK-330-B) — shared by the confirmation page and the account order detail
// (TASK-217). The panel lives here, beside `useOrderPayment`, because a widget
// may not import another widget.
export {
  OrderPaymentPanel,
  offersPaymentRetry,
  type AwaitingPayment,
} from "./ui/order-payment-panel";
export {
  usePaymentAttemptWatch,
  useForgetSettledPaymentAttempt,
  CALLBACK_WAIT_MS,
  CALLBACK_POLL_MS,
  type PaymentAttemptWatch,
} from "./model/use-payment-attempt-watch";
export {
  readPaymentAttempt,
  rememberPaymentAttempt,
  forgetPaymentAttempt,
  PAYMENT_ATTEMPT_TTL_MS,
  type PaymentAttempt,
} from "./lib/payment-attempt";
