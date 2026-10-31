"use client";

import { useCallback, useEffect, useState } from "react";

export interface ScrollEdges {
  /** Callback ref for the horizontal scroller (survives the element being swapped). */
  setScroller: (element: HTMLElement | null) => void;
  /** The scroller is at (or within 1px of) its left edge. */
  atStart: boolean;
  /** The scroller is at (or within 1px of) its right edge. */
  atEnd: boolean;
  /** Scroll by 80 % of the visible width; `-1` back, `1` forward. */
  scrollByPage: (direction: 1 | -1) => void;
}

/**
 * useScrollEdges — whether a horizontal rail can scroll further either way
 * (TASK-2079: rail arrows grey out at the row's ends, ComponentStates
 * «disabled (кінець ряду)»). Measured on a passive `scroll` listener and a
 * `ResizeObserver` on the scroller. A callback ref rather than a ref object:
 * a tabbed rail mounts a new scroller per tab (and a loading skeleton first),
 * and the state must follow whichever element is current. A row that fits on
 * one screen is at both edges.
 *
 * Client-only (DOM listeners) — import it directly, not through the
 * `@/shared/lib` barrel.
 */
export function useScrollEdges(): ScrollEdges {
  const [element, setElement] = useState<HTMLElement | null>(null);
  // Before the first measurement: at the start, end unknown → next enabled.
  const [edges, setEdges] = useState({ atStart: true, atEnd: false });

  useEffect(() => {
    if (!element) return;
    const measure = () => {
      const atStart = element.scrollLeft <= 1;
      const atEnd =
        element.scrollLeft + element.clientWidth >= element.scrollWidth - 1;
      setEdges((prev) =>
        prev.atStart === atStart && prev.atEnd === atEnd
          ? prev
          : { atStart, atEnd },
      );
    };
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(element);
    return () => {
      element.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [element]);

  const scrollByPage = useCallback(
    (direction: 1 | -1) => {
      if (!element) return;
      element.scrollBy({
        left: direction * element.clientWidth * 0.8,
        behavior: "smooth",
      });
    },
    [element],
  );

  return { setScroller: setElement, scrollByPage, ...edges };
}
