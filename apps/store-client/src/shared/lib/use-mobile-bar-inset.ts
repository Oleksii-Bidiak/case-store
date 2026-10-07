"use client";

import { type RefObject, useLayoutEffect } from "react";

/**
 * The custom property a fixed bottom bar publishes on <html> while it is
 * mounted (TASK-1771): its own measured height. globals.css turns it into the
 * toast lift below `md` (`--toast-offset-bottom` / `--toast-mobile-offset-bottom`),
 * so the global toaster stacks ABOVE the bar instead of over its primary action —
 * WCAG 2.4.11 Focus Not Obscured: after «Прибрати N недоступних» focus lands on
 * «Оформити замовлення» in the bar, exactly where the toast used to appear.
 */
export const MOBILE_BAR_INSET_VAR = "--mobile-bar-inset";

/**
 * Every mounted bar's current height, keyed per hook instance. Two bars can be
 * alive in the same commit (the cart summary swaps its blocked bar for the
 * enabled one), so the property follows the TALLEST live bar and is removed
 * only when the last one unmounts — never by an older bar's late cleanup.
 */
const liveBars = new Map<object, number>();

function publish() {
  const root = document.documentElement;
  if (liveBars.size === 0) {
    root.style.removeProperty(MOBILE_BAR_INSET_VAR);
    return;
  }
  const tallest = Math.max(...liveBars.values());
  root.style.setProperty(MOBILE_BAR_INSET_VAR, `${tallest}px`);
}

/**
 * useMobileBarInset — publish a fixed bottom bar's height for the toaster.
 *
 * The height is MEASURED, not assumed: the bar's content wraps differently with
 * a long amount or a larger system font, and a constant would drift. From `md`
 * up the bars dissolve (`md:contents` / `md:hidden`) and measure 0; globals.css
 * additionally reads the property below `md` only, so desktop toast placement
 * never moves even if an observer misses the breakpoint switch.
 */
export function useMobileBarInset(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const key = {};
    const measure = () => {
      liveBars.set(key, Math.ceil(bar.getBoundingClientRect().height));
      publish();
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(bar);
    return () => {
      observer?.disconnect();
      liveBars.delete(key);
      publish();
    };
  }, [ref]);
}
