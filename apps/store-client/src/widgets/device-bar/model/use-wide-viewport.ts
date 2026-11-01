"use client";

import { useSyncExternalStore } from "react";

/** `lg` — tier 2 and the idle pills exist from here (DeviceBar mockup). */
export const WIDE_VIEWPORT_QUERY = "(min-width: 64rem)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(WIDE_VIEWPORT_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(WIDE_VIEWPORT_QUERY).matches;
}

/**
 * True at ≥ 1024. Gates the tier-2 data request only — the markup itself is
 * still switched by `lg:` classes, so a resize never waits on React.
 * `false` on the server, like the device list it pairs with.
 */
export function useWideViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
