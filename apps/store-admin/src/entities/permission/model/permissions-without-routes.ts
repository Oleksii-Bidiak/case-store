/**
 * Permissions that exist in the code catalogue but that no endpoint requires.
 *
 * WHY THIS MECHANISM EXISTS: a checkbox that grants nothing is worse than a
 * missing checkbox. The owner ticks "Повертати гроші", believes the refund desk
 * is delegated, and finds out months later that the manager was hitting 403 the
 * whole time. Surfacing the gap turns a silent mismatch into a visible "не діє"
 * badge.
 *
 * **The set is currently empty, and that is the correct steady state.** When it
 * was first derived on 2026-07-28 it held three entries; all three were then
 * resolved at integration rather than documented away:
 *
 *   - `payments:read` and `payments:refund` — `PaymentService.getAttemptsForOrder`
 *     and `.refund` existed, were docblocked "admin payment card" and were unit
 *     tested, but no controller exposed either, so the admin payment card could
 *     show neither attempt history nor a refund action. `AdminPaymentController`
 *     now does, and both permissions gate real routes.
 *   - `stock:write` — removed from the catalogue instead of given a route. Stock
 *     is edited through the ordinary product update, so it was never a separable
 *     capability, and offering it implied a control that did not exist: anyone
 *     holding `products:write` could change stock whatever the box said.
 *
 * MAINTENANCE: re-derive whenever a new admin module lands, by collecting every
 * `@RequirePermission('…')` under `apps/store-api/src` and subtracting it from
 * `permission.catalog.ts`. Drift here is harmless in one direction only (a stale
 * badge on a permission that has since gained a route); the dangerous direction —
 * a route naming a permission that does not exist — is caught by the backend's
 * own `permission.catalog.spec.ts`, which fails the build.
 */
export const PERMISSIONS_WITHOUT_ROUTES: ReadonlySet<string> = new Set([]);
