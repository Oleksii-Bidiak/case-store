"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Returns a debounced version of `fn` that fires only after `delay` ms of
 * inactivity. Any in-flight timer is cancelled on unmount.
 *
 * The returned callback is stable across renders (its identity changes only when
 * `delay` changes), so it is safe to use as a `useEffect` dependency.
 *
 * NOTE: this is a verbatim copy of the store-client hook
 * (`apps/store-client/src/shared/lib/use-debounced-callback.ts`). The two apps
 * deliberately keep independent copies — do NOT import across app boundaries.
 *
 * @param fn    - The callback to debounce. Captured in a ref so the returned
 *                handle stays stable while always invoking the latest closure.
 * @param delay - Debounce delay in milliseconds (default 300 ms).
 */
export function useDebouncedCallback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay = 300,
): (...args: Args) => void {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the ref current without invalidating the stable callback identity.
  useEffect(() => {
    fnRef.current = fn;
  });

  // Clear any pending timer on unmount so a late callback never fires.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(
    (...args: Args) => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        fnRef.current(...args);
      }, delay);
    },
    [delay],
  );
}
