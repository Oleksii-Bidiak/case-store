"use client";

import { useLayoutEffect, useState } from "react";

/**
 * How many children of a single-row, wrapping, `overflow-hidden` flex box sit
 * on its first line (TASK-2074: «categories that fit», no horizontal scroll).
 *
 * The row lets extra items wrap to a clipped second line; this hook counts the
 * ones still on line one, so the caller can make the rest `invisible` — out of
 * the tab order and the accessibility tree, not just out of sight. Visibility
 * does not change layout, so hiding them never moves the line break (no
 * measure → hide → re-measure loop). `null` until the first measurement.
 *
 * The row is tracked through a callback ref, not a ref object: the caller
 * unmounts and remounts it (loading skeleton ↔ links, e.g. across the 1024
 * breakpoint), and the observer must follow the live node instead of staying
 * on a detached one. `items` re-measures when the content changes without the
 * row's box changing size (another device, same count, same-width label).
 */
export function useFitCount<T extends HTMLElement>(
  items: readonly unknown[],
): [(node: T | null) => void, number | null] {
  const [row, setRow] = useState<T | null>(null);
  const [fit, setFit] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!row) return;

    const measure = () => {
      const children = Array.from(row.children) as HTMLElement[];
      const firstTop = children[0]?.offsetTop ?? 0;
      let count = 0;
      for (const child of children) {
        if (child.offsetTop !== firstTop) break;
        count += 1;
      }
      setFit(count);
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [row, items]);

  return [setRow, fit];
}
