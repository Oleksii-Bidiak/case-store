"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * How many children of a single-row, wrapping, `overflow-hidden` flex box sit
 * on its first line (TASK-2074: «categories that fit», no horizontal scroll).
 *
 * The row lets extra items wrap to a clipped second line; this hook counts the
 * ones still on line one, so the caller can make the rest `invisible` — out of
 * the tab order and the accessibility tree, not just out of sight. Visibility
 * does not change layout, so hiding them never moves the line break (no
 * measure → hide → re-measure loop). `null` until the first measurement.
 */
export function useFitCount<T extends HTMLElement>(
  itemCount: number,
): [RefObject<T | null>, number | null] {
  const ref = useRef<T | null>(null);
  const [fit, setFit] = useState<number | null>(null);

  useLayoutEffect(() => {
    const row = ref.current;
    if (!row) return;

    const measure = () => {
      const items = Array.from(row.children) as HTMLElement[];
      const firstTop = items[0]?.offsetTop ?? 0;
      let count = 0;
      for (const item of items) {
        if (item.offsetTop !== firstTop) break;
        count += 1;
      }
      setFit(count);
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [itemCount]);

  return [ref, fit];
}
