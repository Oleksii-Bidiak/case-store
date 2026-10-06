"use client";

import { useEffect, useState } from "react";

/** How often a live countdown re-reads the clock. */
export const NOW_TICK_MS = 30_000;

/**
 * The current time, re-read every `intervalMs` while `enabled` (TASK-217).
 *
 * For minute-resolution countdowns («Очікує оплати · 23 хв»): a 30-second tick
 * keeps the figure at most half a minute stale and lets the note disappear
 * within 30 s of the deadline, without a timer per second per card. With
 * `enabled = false` (no order on the screen is waiting for payment) no timer
 * runs at all. The pure arithmetic is `reservationMinutesLeft`.
 */
export function useNow(enabled = true, intervalMs = NOW_TICK_MS): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNow(Date.now());
    // Catch up straight away (on the next task, not inside the effect): the
    // value is the mount time, and the list may have loaded well after it.
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, intervalMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [enabled, intervalMs]);

  return now;
}
