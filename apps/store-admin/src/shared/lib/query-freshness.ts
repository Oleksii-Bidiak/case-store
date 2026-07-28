/**
 * How fresh an admin list has to be (TASK-353).
 *
 * `app/providers.tsx` sets `staleTime: 5 хв` for every query in store-admin.
 * That is a sensible default for a reference table — brands do not change while
 * you are looking at them — but it is wrong for a queue two people work at once.
 * Combined with TanStack Query's focus refetch being a no-op on fresh data, it
 * meant an operator could sit on a five-minute-old order list, switch tabs,
 * come back, and still see the same five-minute-old list.
 *
 * The fix is deliberately NOT a lower global default. Dropping `staleTime` for
 * everything would put the brand, FAQ and device-model lists on the same refetch
 * cadence as the order queue for no benefit, and every window focus anywhere in
 * the panel would fan out into refetches of whatever is mounted.
 *
 * So: operational lists opt in, one query hook at a time. The same shape as
 * `features/category-tree-reorder/model/use-admin-category-tree-query.ts`, which
 * already sets `refetchOnWindowFocus: false` locally rather than globally.
 *
 * Usage with an Orval hook:
 *
 *     useAdminOrderControllerFindAll(params, {
 *       query: OPERATIONAL_LIST_QUERY,
 *     });
 */

/** Half a minute: long enough to survive a render storm, short enough that
 *  coming back to the tab shows what actually happened while you were away. */
export const OPERATIONAL_STALE_MS = 30_000;

/**
 * Query options for a list an operator works from — orders, contact messages,
 * reviews awaiting moderation, returns. Anything where a stale row means acting
 * on something a colleague already handled.
 *
 * `refetchOnWindowFocus` is left at its default `true`; it becomes meaningful
 * again once `staleTime` is short.
 */
export const OPERATIONAL_LIST_QUERY = {
  staleTime: OPERATIONAL_STALE_MS,
} as const;
