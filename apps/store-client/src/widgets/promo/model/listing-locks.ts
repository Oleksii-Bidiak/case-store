/**
 * The discount lock of the «Товари зі знижкою» listing (TASK-1301). One
 * constant for the server prefetch, the client view and the loading skeleton
 * (TASK-869), so all three agree: the prefetch and the view build the same
 * params — and therefore the same React Query key (TASK-563) — and the skeleton
 * draws the rail without «Знижки», as the locked view does.
 */
export const PROMO_LISTING_LOCKS = { onSale: true } as const;
