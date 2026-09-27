"use client";

import { useEffect, useState } from "react";

/**
 * A clock that re-renders its caller on a fixed tick (TASK-629).
 *
 * Returns the instant of the LAST tick, or `null` before the first one. The
 * caller combines it with an instant it already holds — typically a query's
 * `dataUpdatedAt` — as `Math.max(dataUpdatedAt, tick ?? 0)`:
 *
 * - `Date.now()` is never read during render. The clock is read inside the
 *   interval callback, so the render stays pure and two renders of the same
 *   state show the same minute count (the reason the order card used
 *   `dataUpdatedAt` in the first place).
 * - Before the first tick the fetch instant IS the right "now" — the data was
 *   just loaded — so there is no mount-time `setState` to cause a second render.
 * - After a refetch, a fresher `dataUpdatedAt` wins over an older tick.
 *
 * Without it «Очікує оплати · 4 хв» froze at the fetch: six minutes later the
 * card still said «4 хв» while the reservation worker had already cancelled the
 * order and released the stock.
 *
 * Client-only, and therefore NOT re-exported from the `@/shared/lib` barrel
 * (server components import that barrel). Import it directly:
 *   import { useNow } from "@/shared/lib/use-now";
 */
export function useNow(intervalMs: number): number | null {
  const [tick, setTick] = useState<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return tick;
}
