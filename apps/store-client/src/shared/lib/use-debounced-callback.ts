"use client";

import { useEffect, useMemo, useRef } from "react";

/**
 * A debounced call handle: invoke it to (re)schedule, `cancel()` to drop what is
 * scheduled.
 */
export interface DebouncedCallback<Args extends unknown[]> {
  (...args: Args): void;
  /**
   * Drop the pending invocation, if any, WITHOUT firing it. A no-op when
   * nothing is pending, so callers never have to ask first. Clears the timeout
   * and nulls the ref, so "is something still pending?" stays answerable
   * afterwards rather than being reported by a stale, already-fired id.
   */
  cancel: () => void;
}

/**
 * Returns a debounced version of `fn` that fires only after `delay` ms of
 * inactivity. Any in-flight timer is cancelled on unmount.
 *
 * The returned callback is stable across renders (its identity changes only when
 * `delay` changes), so it is safe to use as a `useEffect` dependency — the exact
 * property `SearchInput` needs for TASK-117.
 *
 * ── Why `cancel()` exists ───────────────────────────────────────────────────
 * A debounce with no way to abort is a correctness hole, not an inconvenience,
 * anywhere a LATER explicit user action has already decided the outcome the
 * pending call will overwrite. The admin `TableSearch` (TASK-423) cleared its
 * box on Escape while the keystrokes before it were still in flight; ~300 ms
 * later the surviving timer wrote the abandoned term back into `?search=` and
 * advanced the component's own "last pushed" guard to it, so the re-seed effect
 * saw URL and guard agree and left the operator with an EMPTY search box over a
 * list filtered by a term they had just cancelled — with nothing on screen to
 * explain it. Callers that predate `cancel()` work around the gap with a
 * monotonic token they check inside the callback; prefer `cancel()`.
 *
 * NOTE: this file is a VERBATIM copy shared by the two frontends —
 * `apps/store-admin/src/shared/lib/use-debounced-callback.ts` and
 * `apps/store-client/src/shared/lib/use-debounced-callback.ts`. The apps
 * deliberately keep independent copies (do NOT import across app boundaries),
 * which means every change here must land in BOTH files, byte for byte.
 *
 * @param fn    - The callback to debounce. Captured in a ref so the returned
 *                handle stays stable while always invoking the latest closure.
 * @param delay - Debounce delay in milliseconds (default 300 ms).
 */
export function useDebouncedCallback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay = 300,
): DebouncedCallback<Args> {
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

  // `useMemo` rather than `useCallback` only because the handle carries a
  // `cancel` property; the stability contract is unchanged — one identity per
  // `delay`, so it remains safe as an effect dependency.
  return useMemo(() => {
    const debounced = ((...args: Args) => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        fnRef.current(...args);
      }, delay);
    }) as DebouncedCallback<Args>;

    debounced.cancel = () => {
      if (timerRef.current === null) return;
      clearTimeout(timerRef.current);
      timerRef.current = null;
    };

    return debounced;
  }, [delay]);
}
