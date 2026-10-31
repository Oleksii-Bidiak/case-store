"use client";

import { type RefObject, useLayoutEffect } from "react";

/**
 * The custom property the sticky site header publishes on <html>: its own
 * measured height. globals.css derives `--sticky-header-offset` from it, and
 * every sticky aside (`STICKY_ASIDE_TOP`), anchor `scroll-mt-*` and the
 * sticky-aside height cap read that offset.
 *
 * The header is no longer a fixed 64px row: the «Мої пристрої» bar (TASK-2074)
 * adds tier 1 at every width and tier 2 from 1024 with a saved device, and
 * tier 2 hides when its categories fail to load. A constant would drift, so
 * the height is MEASURED. Before hydration globals.css carries the same values
 * as a CSS fallback (with `html[data-has-device]` for tier 2), so the first
 * paint is already right for the common cases.
 */
export const HEADER_HEIGHT_VAR = "--header-height";

/** useHeaderHeight — publish the sticky header's height on <html>. */
export function useHeaderHeight(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const header = ref.current;
    if (!header) return;
    const root = document.documentElement;
    const measure = () => {
      root.style.setProperty(
        HEADER_HEIGHT_VAR,
        `${Math.ceil(header.getBoundingClientRect().height)}px`,
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(header);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(HEADER_HEIGHT_VAR);
    };
  }, [ref]);
}
