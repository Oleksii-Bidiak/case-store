/**
 * 308s from the pre-TASK-217 order URLs into the account (`next.config.ts`
 * `redirects()`). Config redirects answer before routing, so the old pages need
 * no `loading.tsx`-safe `permanentRedirect()` and the query string travels on its
 * own (`/orders?status=active` → `/account/orders?status=active`).
 *
 * Deliberately NOT a `/orders/:path*` catch-all — three `/orders/*` routes stay:
 *   - `/orders/status`             — the public order lookup (TASK-483);
 *   - `/orders/guest/[token]`      — a guest's emailed order link (TASK-338);
 *   - `/orders/[id]/confirmation`  — checkout step 3: LiqPay's `result_url`, the
 *     checkout push target and the `purchase` event (owner decision 2026-10-05).
 * The single-segment rule excludes `status` and `guest` by a lookahead; the other
 * two are two segments deep and never match it.
 */
export const LEGACY_ORDER_REDIRECTS = [
  { source: "/orders", destination: "/account/orders", permanent: true },
  {
    source: "/orders/:id((?!status$|guest$)[^/]+)",
    destination: "/account/orders/:id",
    permanent: true,
  },
] as const;
