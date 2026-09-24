/** How long an effective-permission answer is trusted before a refetch. */
export const PERMISSIONS_STALE_MS = 30_000;

/**
 * Observer options for `useGetMyPermissions`, shared by every component that
 * reads it (TASK-725).
 *
 * `AuthProvider` owns the query; the profile screen observes the same key to
 * name the permissions. Two observers of one key with different options is a
 * quiet bug: each observer judges staleness and focus refetches by its own
 * options, and query-level ones such as `retry` come from whichever observer
 * set them last — so a second observer with its own numbers changes when, and
 * how stubbornly, the whole panel refetches its rights. One constant keeps
 * them identical.
 *
 * `retry: false` because the only interesting failure (401) is not worth
 * retrying, and a failed fetch degrades to "no permissions" — the safe
 * direction: a manager sees an empty panel rather than links that 403.
 */
export const MY_PERMISSIONS_QUERY = {
  staleTime: PERMISSIONS_STALE_MS,
  refetchOnWindowFocus: true,
  retry: false,
} as const;
