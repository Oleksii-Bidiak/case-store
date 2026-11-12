"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

/** The attribute every rail filter section carries (`ProductFilters`). */
const SECTION_ATTR = "data-filter-section";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

/**
 * The section to bring back: the element itself while it is still mounted,
 * else its re-rendered twin in the rail, found by the same id.
 */
function resolveSection(
  rail: HTMLElement | null,
  remembered: { element: Element; id: string | null },
): Element | null {
  if (remembered.element.isConnected) return remembered.element;
  if (!rail || remembered.id === null) return null;
  return (
    Array.from(rail.querySelectorAll(`[${SECTION_ATTR}]`)).find(
      (node) => node.getAttribute(SECTION_ATTR) === remembered.id,
    ) ?? null
  );
}

/**
 * Bring `section` back to the top of the screen — but only when the new
 * results moved its top out of view. Its top must stay below the sticky
 * header: the section's own `scroll-margin-top` (`--sticky-header-offset`)
 * is both that line and where `scrollIntoView` lands it.
 */
function revealIfLost(section: Element): void {
  const top = section.getBoundingClientRect().top;
  const headerOffset =
    Number.parseFloat(getComputedStyle(section).scrollMarginTop) || 0;
  if (top >= headerOffset && top < window.innerHeight) return;
  section.scrollIntoView({
    block: "start",
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
}

export interface KeepFilterSectionInView {
  /** The desktop rail's callback `ref`: where the sections are looked up. */
  attachRail: (node: HTMLElement | null) => void;
  /**
   * The rail's `onPointerDownCapture` and `onKeyDownCapture`. React capture
   * handlers on purpose: a portalled popover a section opens still reaches
   * them through the React tree, and then the section remembered at its
   * trigger stays.
   */
  rememberSection: (
    event: PointerEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
  ) => void;
  /** Call right after the rail wrote a filter change to the URL. */
  arm: () => void;
  /** Call on every other URL change (sort, view, chips): keep the position. */
  disarm: () => void;
}

/**
 * Keeps the clicked rail filter section on screen across a filter change
 * (TASK-2414). The navigation itself never scrolls (`scroll: false`), so
 * normally nothing moves. But new results can shorten the page (the browser
 * then clamps the scroll) or reflow the rail (narrowed brands, other spec
 * facets) — and the section the shopper was working in slides out of view.
 * Only then, once the new URL is committed and its results have rendered,
 * it is brought back to the start of THAT section; otherwise the scroll
 * stays put.
 *
 * Desktop rail only: the mobile drawer scrolls inside itself.
 *
 * @param commitKey the committed query string — changes when the URL lands
 * @param settled   `false` while the new URL's results are still fetching
 */
export function useKeepFilterSectionInView(
  commitKey: string,
  settled: boolean,
): KeepFilterSectionInView {
  const railRef = useRef<HTMLElement | null>(null);
  const remembered = useRef<{ element: Element; id: string | null } | null>(
    null,
  );
  // The query string the armed change was written from: the check waits
  // until the committed one differs from it.
  const armedFrom = useRef<string | null>(null);
  const commitKeyRef = useRef(commitKey);

  useEffect(() => {
    commitKeyRef.current = commitKey;
  }, [commitKey]);

  const attachRail = useCallback((node: HTMLElement | null) => {
    railRef.current = node;
  }, []);

  const rememberSection = useCallback(
    (event: PointerEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
      const { target } = event;
      const rail = railRef.current;
      if (!(target instanceof Element)) return;
      // A portalled popover opened from a section: keep that section.
      if (rail && !rail.contains(target)) return;
      const section = target.closest(`[${SECTION_ATTR}]`);
      remembered.current = section
        ? { element: section, id: section.getAttribute(SECTION_ATTR) }
        : null;
    },
    [],
  );

  const arm = useCallback(() => {
    armedFrom.current = remembered.current ? commitKeyRef.current : null;
  }, []);
  const disarm = useCallback(() => {
    armedFrom.current = null;
  }, []);

  useEffect(() => {
    if (armedFrom.current === null) return;
    if (commitKey === armedFrom.current || !settled) return;
    // One frame after the commit render, so the results have laid out.
    const frame = requestAnimationFrame(() => {
      armedFrom.current = null;
      const target = remembered.current
        ? resolveSection(railRef.current, remembered.current)
        : null;
      if (target) revealIfLost(target);
    });
    return () => cancelAnimationFrame(frame);
  }, [commitKey, settled]);

  return { attachRail, rememberSection, arm, disarm };
}
