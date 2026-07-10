"use client";

import { useSyncExternalStore } from "react";

/** The media query that signals the user prefers reduced motion. */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Subscribe to `prefers-reduced-motion` changes; no-op without `matchMedia`. */
function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** Read the current preference (client). */
function getSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** SSR snapshot — motion is allowed until the client knows otherwise. */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * Returns `true` when the user has asked the OS to reduce motion
 * (`prefers-reduced-motion: reduce`).
 *
 * Built on `useSyncExternalStore`: SSR-safe (`false` on the server and first
 * client render, so markup matches), reactive to runtime `change` events, and
 * with the subscription cleaned up on unmount — no effect-driven `setState`.
 *
 * Use it to gate non-essential motion — auto-advancing carousels, parallax,
 * decorative animations — per the design system's motion rules.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
