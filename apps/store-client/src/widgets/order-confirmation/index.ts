// Order confirmation widget — full UI for the post-checkout confirmation page,
// plus the guest's tokenised view of the same order (TASK-338). They live in one
// slice because they render the same order from two different credentials.
export { OrderConfirmationView } from "./ui/order-confirmation-view";
export { OrderConfirmationSkeleton } from "./ui/order-confirmation-skeleton";
export { GuestOrderView } from "./ui/guest-order-view";
