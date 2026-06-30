// Shared API — Axios instance, custom mutator, and Orval-generated hooks
export {
  api,
  customInstance,
  getAccessToken,
  setAccessToken,
} from "./instance";
export type { ErrorType, BodyType } from "./instance";

// Orval-generated endpoint hooks, grouped by API tag.
// NOTE: `generated/` is git-ignored — run `npm run generate:api` after checkout.
export * from "./generated/auth/auth";
export * from "./generated/users/users";
export * from "./generated/products/products";
export * from "./generated/product-groups/product-groups";
export * from "./generated/categories/categories";
export * from "./generated/pages/pages";
export * from "./generated/site-contact/site-contact";
export * from "./generated/admin-orders/admin-orders";
export * from "./generated/admin-dashboard/admin-dashboard";
export * from "./generated/cart/cart";
export * from "./generated/reviews/reviews";

// Generated DTO / entity types
export * from "./generated/models";
