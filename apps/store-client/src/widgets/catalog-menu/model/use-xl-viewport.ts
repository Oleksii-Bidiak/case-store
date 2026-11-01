"use client";

import { useSyncExternalStore } from "react";

/** `xl` — the mega menu's «Ваш пристрій» column exists from here. */
export const XL_VIEWPORT_QUERY = "(min-width: 80rem)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(XL_VIEWPORT_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(XL_VIEWPORT_QUERY).matches;
}

/**
 * True at ≥ 1280. Gates the device column's data requests only — the column
 * itself is switched by `xl:` classes, so a resize never waits on React.
 */
export function useXlViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
