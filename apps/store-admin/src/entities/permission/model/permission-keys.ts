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
  // TASK-427: the delete action in the product row / edit page / card. Its own
  // key in the backend catalogue since TASK-140 — a manager who may edit prices
  // is not automatically a manager who may retire a position.
  productsDelete: "products:delete",
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
  // TASK-446: answering a review PUBLICLY, as the shop, is its own capability and
  // deliberately not folded into `reviews:moderate` — deciding what stays on the
  // site and speaking on the shop's behalf to every visitor are different jobs.
  //
  // BRAND NEW, AND WITH NO BACKFILL ON PURPOSE. No existing MANAGER holds it, so
  // the reply button is invisible for every manager on a fresh deploy until the
  // owner ticks the box on the permissions screen. That is the intended state,
  // not a gap to paper over: granting it client-side would hand out a button
  // whose only possible outcome is a 403 from `@RequirePermission('reviews:write')`.
  reviewsWrite: "reviews:write",

  // TASK-441 — the media library. Two keys, not one: `media:read` gates the
  // library screen AND the picker that will sit inside every content form, so it
  // cannot be the write permission of any one entity; `media:write` gates the
  // destructive half (upload, retag, delete) a picker does not need. Both are
  // backfilled onto existing roles by the migration that introduced them — see
  // MEDIA_BACKFILL_SOURCE_PERMISSIONS in the API's `permission.catalog.ts`.
  mediaRead: "media:read",
  mediaWrite: "media:write",

  discountsWrite: "discounts:write",
  newsletterRead: "newsletter:read",

  customersRead: "customers:read",
  // TASK-430: gates the customer-notes textarea on `/users/[id]`. The same key
  // also governs account deactivation server-side (`user.controller.ts:356`,
  // `:387`), which is why the backend catalogue label names both capabilities.
  //
  // Named here rather than inlined at the call site for the reason this whole
  // file exists: `can()` takes a plain `string`, so `customer:write` or
  // `customers:Write` compiles and runs — and the owner never sees the breakage,
  // because `can()` answers true for ADMIN whatever it is asked. Only MANAGERs
  // lose the control, silently, while the API goes on accepting the request they
  // can no longer send.
  customersWrite: "customers:write",

  messagesRead: "messages:read",

  settingsSeo: "settings:seo",
  settingsContacts: "settings:contacts",
  settingsSearch: "settings:search",

  analyticsRead: "analytics:read",
} as const;

export type PermissionKey = (typeof PERM)[keyof typeof PERM];
