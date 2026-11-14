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

/** What was clicked, and where it sat on screen at the click. */
interface RememberedSection {
  element: Element;
  id: string | null;
  /** The section's top (viewport px) at pointerdown/keydown. */
  topAtClick: number;
  /** The clicked control and its rect at the click; `null` if none. */
  control: { element: Element; top: number; bottom: number } | null;
}

/**
 * The section to bring back: the element itself while it is still mounted,
 * else its re-rendered twin in the rail, found by the same id.
 */
function resolveSection(
  rail: HTMLElement | null,
  remembered: RememberedSection,
): Element | null {
  if (remembered.element.isConnected) return remembered.element;
  if (!rail || remembered.id === null) return null;
  return (
    Array.from(rail.querySelectorAll(`[${SECTION_ATTR}]`)).find(
      (node) => node.getAttribute(SECTION_ATTR) === remembered.id,
    ) ?? null
  );
}

/** In the visible band: below the sticky header line, above the fold. */
function onScreen(top: number, bottom: number, headerOffset: number): boolean {
  return bottom > headerOffset && top < window.innerHeight;
}

/**
 * Bring `section` back — but only when the new results moved it, never
 * because of where the shopper had scrolled before the click. The sticky
 * header line is the section's own `scroll-margin-top`
 * (`--sticky-header-offset`), which is also where `scrollIntoView` lands it.
 *
 * Compared with the click, reveal when:
 * - the whole section left the screen;
 * - its top was in view and is now gone (under the header or below the fold);
 * - the clicked control was in view and is now gone.
 *
 * A section whose top the shopper had already scrolled under the header
 * stays put while the clicked control is still in view. The reveal goes to
 * the section's start, unless that would push the clicked control below
 * the fold (a section taller than the screen): then a lost control is
 * scrolled back to the nearest edge, and one still in view stays put.
 */
function revealIfLost(section: Element, remembered: RememberedSection): void {
  const rect = section.getBoundingClientRect();
  const headerOffset =
    Number.parseFloat(getComputedStyle(section).scrollMarginTop) || 0;
  const topVisible = (top: number) =>
    top >= headerOffset && top < window.innerHeight;

  const control = remembered.control?.element.isConnected
    ? remembered.control
    : null;
  const controlRect = control ? control.element.getBoundingClientRect() : null;
  const controlLost =
    control !== null &&
    controlRect !== null &&
    onScreen(control.top, control.bottom, headerOffset) &&
    !onScreen(controlRect.top, controlRect.bottom, headerOffset);

  const lost =
    !onScreen(rect.top, rect.bottom, headerOffset) ||
    (topVisible(remembered.topAtClick) && !topVisible(rect.top)) ||
    controlLost;
  if (!lost) return;

  const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";
  // Where the control's bottom lands once the section's start sits at the line.
  if (
    controlRect !== null &&
    controlRect.bottom - rect.top + headerOffset > window.innerHeight
  ) {
    // Still in view: moving to the start would only push it off screen.
    if (!controlLost) return;
    const delta =
      controlRect.top < headerOffset
        ? controlRect.top - headerOffset
        : controlRect.bottom - window.innerHeight;
    window.scrollBy({ top: delta, behavior });
    return;
  }
  section.scrollIntoView({ block: "start", behavior });
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
  arm: (nextKey?: string) => void;
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
 * stays put. «Moved» is measured against the click: where the section and
 * the clicked control sat at pointerdown/keydown (see `revealIfLost`).
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
  const remembered = useRef<RememberedSection | null>(null);
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
      if (!section) {
        remembered.current = null;
        return;
      }
      const controlRect = target.getBoundingClientRect();
      remembered.current = {
        element: section,
        id: section.getAttribute(SECTION_ATTR),
        topAtClick: section.getBoundingClientRect().top,
        control:
          target === section
            ? null
            : {
                element: target,
                top: controlRect.top,
                bottom: controlRect.bottom,
              },
      };
    },
    [],
  );

  // `nextKey`: the query string the change writes. When it equals the current
  // one (a click that changed nothing) no commit will follow, so nothing is
  // armed — a stale arm would fire on the NEXT unrelated navigation (a page
  // link) and pull the shopper back to the rail.
  const arm = useCallback((nextKey?: string) => {
    armedFrom.current =
      remembered.current && nextKey !== commitKeyRef.current
        ? commitKeyRef.current
        : null;
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
      const current = remembered.current;
      const target = current ? resolveSection(railRef.current, current) : null;
      if (current && target) revealIfLost(target, current);
    });
    return () => cancelAnimationFrame(frame);
  }, [commitKey, settled]);

  return { attachRail, rememberSection, arm, disarm };
}
