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

  // Needs-action counters (TASK-248) — all-clear by default; override per-test.
  http.get("*/api/admin/dashboard/needs-action", () =>
    HttpResponse.json({
      data: {
        newOrders: 0,
        pendingReviews: 0,
        unpaidInTransit: 0,
        failedMails: 0,
      },
    }),
  ),

  // Admin order list — empty page by default; tolerates any `status` CSV so the
  // lifecycle tabs (TASK-250) never hit onUnhandledRequest. Override per-test.
  http.get("*/api/admin/orders", () =>
    HttpResponse.json({
      data: [],
      meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
    }),
  ),

  // Auth — admin session bootstrap.
  http.post("*/api/auth/login", () =>
    HttpResponse.json({ data: { accessToken: "test.access.token" } }),
  ),
  http.post("*/api/auth/refresh", () =>
    HttpResponse.json({ data: {} }, { status: 401 }),
  ),

  // CSRF token fetched lazily by the axios instance before mutations.
  http.get("*/api/csrf-token", () =>
    HttpResponse.json({ data: { csrfToken: "test-csrf" } }),
  ),
];
