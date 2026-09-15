// Features — Business interactions (ProductFilters, AddToCart, …)
export { ProductFilters } from "./product-filters";
export { LoginForm, RegisterForm, LogoutButton } from "./auth";
export { AddToCartButton } from "./add-to-cart";
export { SearchAutocomplete } from "./search";
export { WishlistToggleButton } from "./toggle-wishlist";
export { CancelOrderButton } from "./cancel-order";
// TASK-373: the customer's own door onto `POST /orders/:orderId/returns`, which
// had existed since TASK-340 with nothing in the storefront calling it.
export { ReturnRequestButton } from "./return-request";
export { CheckoutAddressForm, useCheckout } from "./checkout";
export { SubmitReviewForm } from "./submit-review";
export { NewsletterSubscribeForm } from "./newsletter-subscribe";
export {
  ApplyDiscount,
  useAppliedDiscount,
  setAppliedDiscount,
  clearAppliedDiscount,
  type AppliedDiscount,
} from "./apply-discount";
