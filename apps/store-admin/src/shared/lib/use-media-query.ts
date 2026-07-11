"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query and report whether it currently matches.
 *
 * Used where a CSS-only responsive transform has to be mirrored in the
 * accessibility tree (e.g. the `layout="card"` table below `md`, TASK-276):
 * ARIA roles cannot be swapped by a media query, so the component needs to know
 * which layout is actually painted.
 *
 * - Pass `null` to opt out entirely (no `matchMedia` call, no listener) — this
 *   keeps the hook callable unconditionally from components that only sometimes
 *   care about the viewport.
 * - SSR / the hydration pass always report `false` (the desktop branch). The
 *   real value arrives in the first post-hydration render via
 *   `useSyncExternalStore`, so there is no hydration mismatch.
 *
 * NOTE: not re-exported from `@/shared/lib` — that barrel is imported by server
 * components and must stay free of `"use client"` modules. Import directly.
 */
export function useMediaQuery(query: string | null): boolean {
  const getMediaQueryList = useCallback((): MediaQueryList | null => {
    if (query === null || typeof window === "undefined") return null;
    if (typeof window.matchMedia !== "function") return null;
    return window.matchMedia(query);
  }, [query]);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mql = getMediaQueryList();
      if (!mql || typeof mql.addEventListener !== "function") return () => {};
      mql.addEventListener("change", onStoreChange);
      return () => mql.removeEventListener("change", onStoreChange);
    },
    [getMediaQueryList],
  );

  const getSnapshot = useCallback(
    () => getMediaQueryList()?.matches ?? false,
    [getMediaQueryList],
  );

  const getServerSnapshot = () => false;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
