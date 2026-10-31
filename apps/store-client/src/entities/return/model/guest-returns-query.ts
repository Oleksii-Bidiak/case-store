/**
 * Query options for `GET /orders/guest/:token/returns` — shared by the guest
 * order's return history and the guest return dialog, which read the same
 * cache entry.
 *
 * The guest endpoints are throttled per IP (20/min). React Query's default
 * refetch on window focus would spend that budget every time a guest switches
 * tabs, and a guest checking their mail between tabs could lock themselves out
 * of their own order. New data still arrives: a filed request invalidates the
 * entry, and a remount after `staleTime` reads it again.
 */
export const guestReturnsQueryOptions = {
  refetchOnWindowFocus: false,
  staleTime: 60_000,
} as const;
