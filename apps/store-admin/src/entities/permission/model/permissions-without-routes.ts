/**
 * Permissions that exist in the code catalogue but that no endpoint requires
 * yet (TASK-334, plan 164 — "known gap to surface, not to fix").
 *
 * WHY THIS IS RENDERED AT ALL: a checkbox that grants nothing is worse than a
 * missing checkbox. The owner ticks "Повертати гроші", believes the refund desk
 * is delegated, and finds out months later that the manager was hitting 403 the
 * whole time — or, worse, that the action was reachable through a permission
 * they thought they had *not* granted. Surfacing the gap turns a silent
 * mismatch into a visible "не діє" badge.
 *
 * HOW IT WAS DERIVED (2026-07-28, verified against develop @d569c19): every
 * `@RequirePermission('…')` in `apps/store-api/src` was collected and subtracted
 * from `permission.catalog.ts`. What remained:
 *
 *   - `payments:read`   — the admin payment surface lives on the order routes
 *                         and is gated by `orders:read`.
 *   - `payments:refund` — no refund endpoint exists yet (LiqPay refunds are
 *                         TASK-330 follow-up work).
 *   - `stock:write`     — stock is edited through the product routes, gated by
 *                         `products:write`.
 *
 * MAINTENANCE: this list can only drift in the harmless direction (a permission
 * that gained a route keeps a stale "не діє" badge until someone removes the
 * line) and the harmful one is caught by the backend's own
 * `permission.catalog.spec.ts`, which fails the build for a route naming a
 * permission that does not exist. Re-derive it whenever a new admin module
 * lands.
 */
export const PERMISSIONS_WITHOUT_ROUTES: ReadonlySet<string> = new Set([
  "payments:read",
  "payments:refund",
  "stock:write",
]);
