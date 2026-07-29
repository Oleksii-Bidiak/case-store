/**
 * Permission keys the ADMIN UI itself references (TASK-334).
 *
 * This is deliberately NOT a copy of the backend catalogue. The catalogue is
 * owned by `apps/store-api/src/auth/permissions/permission.catalog.ts` and the
 * matrix screen renders whatever that endpoint returns — a new admin section
 * appears there with no change here. These constants exist only because the nav
 * list, the dashboard tiles and a handful of row actions have to name a specific
 * permission in code, and a bare string typo'd in one of those places would
 * silently hide a menu item forever.
 *
 * A key that disappears from the backend catalogue simply stops being granted to
 * anyone, so the corresponding UI hides for managers and stays visible for the
 * owner — the safe direction.
 */
export const PERM = {
  ordersRead: "orders:read",
  ordersWrite: "orders:write",
  returnsRead: "returns:read",

  productsRead: "products:read",
  productsWrite: "products:write",
  categoriesWrite: "categories:write",
  brandsWrite: "brands:write",
  devicesWrite: "devices:write",
  addonsWrite: "addons:write",
  catalogImport: "catalog:import",

  blogWrite: "blog:write",
  pagesWrite: "pages:write",
  bannersWrite: "banners:write",
  carouselsWrite: "carousels:write",
  faqWrite: "faq:write",
  reviewsModerate: "reviews:moderate",

  discountsWrite: "discounts:write",
  newsletterRead: "newsletter:read",

  customersRead: "customers:read",

  messagesRead: "messages:read",

  settingsSeo: "settings:seo",
  settingsContacts: "settings:contacts",

  analyticsRead: "analytics:read",
} as const;

export type PermissionKey = (typeof PERM)[keyof typeof PERM];
