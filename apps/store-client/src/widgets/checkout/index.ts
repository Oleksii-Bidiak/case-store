export { CheckoutView } from "./ui/checkout-view";
export { CheckoutOrderSummary } from "./ui/checkout-order-summary";
// The stepper promises three steps and the flow only ever showed two of them
// (TASK-407). It is exported because the third, «Підтвердження», is rendered by
// the confirmation route, which lives outside this widget.
export { CheckoutStepIndicator } from "./ui/checkout-step-indicator";
