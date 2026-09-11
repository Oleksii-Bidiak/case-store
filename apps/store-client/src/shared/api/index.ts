// Shared API — Axios instance, custom mutator, and Orval-generated hooks
export {
  api,
  customInstance,
  getAccessToken,
  setAccessToken,
  refreshSession,
} from "./instance";
export type { ErrorType, BodyType, RefreshOutcome } from "./instance";

// Orval-generated Cart hooks (useGetCart, useAddToCart, useUpdateCartItem,
// useRemoveCartItem, useClearCart). Upper FSD layers import these from
// `@/shared/api` rather than reaching into `generated/` directly.
// NOTE: `generated/` is git-ignored — run `npm run generate:api` after checkout.
export * from "./generated/cart/cart";

// Generated DTO/entity types (CartEntity, CartItemEntity, CartTotals,
// AddToCartDto, UpdateCartItemDto, …).
export * from "./generated/models";
