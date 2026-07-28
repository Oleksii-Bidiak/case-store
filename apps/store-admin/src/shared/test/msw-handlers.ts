import { http, HttpResponse } from "msw";

/**
 * Default MSW handlers for store-admin component tests. Patterns use a leading
 * `*` so the origin (NEXT_PUBLIC_API_URL, default http://localhost:3001) is
 * absorbed. Return the `{ data, meta? }` envelope shape the real API emits;
 * override per-test with `server.use(...)`.
 */
export const handlers = [
  // Admin product list — empty page by default.
  http.get("*/api/admin/products", () =>
    HttpResponse.json({
      data: [],
      meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
    }),
  ),

  // Needs-action counters (TASK-248, +pendingOver48h TASK-251) — all-clear by
  // default; override per-test.
  http.get("*/api/admin/dashboard/needs-action", () =>
    HttpResponse.json({
      data: {
        newOrders: 0,
        pendingReviews: 0,
        unpaidInTransit: 0,
        failedMails: 0,
        pendingOver48h: 0,
      },
    }),
  ),

  // Order status-history timeline (TASK-251) — empty by default so any test that
  // mounts OrderDetailView (which self-fetches the timeline) stays off
  // onUnhandledRequest. The order-timeline test overrides this per-case.
  http.get("*/api/admin/orders/:orderId/history", () =>
    HttpResponse.json({ data: [] }),
  ),

  // Unread (NEW) contact-message count for the nav «Повідомлення» badge — none
  // by default; both AdminNavList mount points (sidebar + drawer) read it, so a
  // shared stub keeps every shell test off onUnhandledRequest. Override per-test.
  http.get("*/api/contact/admin/unread-count", () =>
    HttpResponse.json({ data: { unread: 0 } }),
  ),

  // Admin order list — empty page by default; tolerates any `status` CSV so the
  // lifecycle tabs (TASK-250) never hit onUnhandledRequest. Override per-test.
  http.get("*/api/admin/orders", () =>
    HttpResponse.json({
      data: [],
      meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
    }),
  ),

  // Content-map count sources (TASK-264) — each of the four list endpoints the
  // /content-map widget fetches returns an empty collection by default so any
  // shell/nav test that mounts near it stays off onUnhandledRequest. The
  // content-map view test overrides these per-case with real counts.
  http.get("*/api/admin/banners", () => HttpResponse.json({ data: [] })),
  http.get("*/api/admin/faq", () => HttpResponse.json({ data: [] })),
  http.get("*/api/admin/pages", () =>
    HttpResponse.json({
      data: [],
      meta: { total: 0, page: 1, limit: 1, totalPages: 0 },
    }),
  ),
  http.get("*/api/admin/blog/posts", () =>
    HttpResponse.json({
      data: [],
      meta: { total: 0, page: 1, limit: 1, totalPages: 0 },
    }),
  ),

  // Global SEO settings singleton (plan 116) — the SERP-preview under the
  // product/category/page meta fields (TASK-268) fetches it for tier-2 defaults
  // + the title template. Zero-config defaults by default; override per-test.
  http.get("*/api/seo-settings", () =>
    HttpResponse.json({
      data: {
        id: "00000000-0000-0000-0000-000000000002",
        defaultMetaTitle: null,
        defaultMetaDescription: null,
        titleTemplate: null,
        defaultOgImage: null,
        // TASK-299: the admin shell's brand mark reads this on every page.
        logoUrl: null,
        noindexSite: false,
        llmsTxtSummary: null,
        additionalSameAsLinks: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }),
  ),

  // SEO-health checklist counts (TASK-269) — all-zero by default so any test
  // that mounts SeoSettingsView stays off onUnhandledRequest; the health-section
  // test overrides this per-case with real counts.
  http.get("*/api/admin/seo-settings/health", () =>
    HttpResponse.json({
      data: {
        productsMissingMetaTitle: 0,
        productsTotal: 0,
        categoriesMissingMetaTitle: 0,
        categoriesTotal: 0,
        pagesMissingMetaTitle: 0,
        pagesTotal: 0,
        pagesMissingMetaDescription: 0,
        pagesThinContent: 0,
      },
    }),
  ),

  // Admin category tree (TASK-291) — the complete, uncapped tree that feeds the
  // treegrid, the category form's parent <Select> and the "Перемістити до…"
  // dialog. Empty by default so any incidental mount stays off
  // onUnhandledRequest; the category suites override it per-case.
  http.get("*/api/categories/admin/tree", () =>
    HttpResponse.json({ data: [] }),
  ),

  // Auth — admin session bootstrap.
  http.post("*/api/auth/login", () =>
    HttpResponse.json({ data: { accessToken: "test.access.token" } }),
  ),
  http.post("*/api/auth/refresh", () =>
    HttpResponse.json({ data: {} }, { status: 401 }),
  ),

  // Signed-in admin profile (TASK-255) — AuthProvider fetches it whenever an
  // access token appears, so every suite that renders the real provider to an
  // authenticated state stays off onUnhandledRequest. Override per-test.
  http.get("*/api/users/me", () =>
    HttpResponse.json({
      data: {
        id: "admin-1",
        email: "admin@example.com",
        firstName: "Admin",
        lastName: "User",
        phone: null,
        role: "ADMIN",
        isActive: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }),
  ),

  // Effective permissions (TASK-334) — AuthProvider fetches this whenever an
  // access token appears, so every suite that renders the real provider to an
  // authenticated state stays off onUnhandledRequest. Owner by default (it
  // matches the admin@example.com profile above): `isOwner` short-circuits
  // `can()`, so pre-existing suites keep seeing the full panel. Override
  // per-test to simulate a MANAGER with a narrow grant set.
  http.get("*/api/auth/me/permissions", () =>
    HttpResponse.json({
      data: { role: "ADMIN", isOwner: true, permissions: [] },
    }),
  ),

  // CSRF token fetched lazily by the axios instance before mutations.
  http.get("*/api/csrf-token", () =>
    HttpResponse.json({ data: { csrfToken: "test-csrf" } }),
  ),
];
