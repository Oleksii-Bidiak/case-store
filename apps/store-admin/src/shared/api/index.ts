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
export * from "./generated/brands/brands";
export * from "./generated/addon-services/addon-services";
export * from "./generated/devices/devices";
export * from "./generated/attribute-definitions/attribute-definitions";
export * from "./generated/catalog-import/catalog-import";
export * from "./generated/pages/pages";
export * from "./generated/blog/blog";
export * from "./generated/banners/banners";
export * from "./generated/site-contact/site-contact";
export * from "./generated/seo-settings/seo-settings";
export * from "./generated/faq/faq";
export * from "./generated/admin-orders/admin-orders";
export * from "./generated/admin-returns/admin-returns";
export * from "./generated/admin-dashboard/admin-dashboard";
export * from "./generated/cart/cart";
export * from "./generated/reviews/reviews";
export * from "./generated/contact/contact";
export * from "./generated/discounts/discounts";
export * from "./generated/newsletter/newsletter";
export * from "./generated/carousels/carousels";
// TASK-334 / TASK-318 — the owner-only RBAC surfaces (permission matrix, log).
export * from "./generated/permissions/permissions";
export * from "./generated/audit/audit";
// TASK-377 — search-index maintenance (reindex). Generated since the endpoint
// existed, but exported by nothing, so the admin had no way to reach it.
export * from "./generated/search/search";
// TASK-380 — storefront traffic, proxied through our API so the analytics
// credential never lands in this bundle.
export * from "./generated/analytics/analytics";

// Generated DTO / entity types
export * from "./generated/models";
