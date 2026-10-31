"use client";

import type { MouseEvent } from "react";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { useReducedMotion } from "@/shared/lib/use-reduced-motion";
import { HubCategoryIcon } from "./hub-icons";

export interface HubChip {
  slug: string;
  name: string;
  count: number;
}

/** DOM id of a category section — also the deep-link hash (`#cases`). */
export function hubSectionId(slug: string): string {
  return slug;
}

/** Id of a section's heading (its accessible name and the focus target). */
export function hubSectionHeadingId(slug: string): string {
  return `dh-h-${slug}`;
}

/**
 * The hero's category chips: real `#<slug>` links (they work before
 * hydration and give each section a shareable address), enhanced to a smooth
 * scroll — instant under reduced motion — that moves focus to the section's
 * heading so keyboard and screen-reader users land where the eye does.
 * Chips WRAP; never a horizontal scroller (mockup rule).
 */
export function DeviceHubChips({
  chips,
  className,
}: {
  chips: readonly HubChip[];
  className?: string;
}) {
  const t = dict.devicePages.hub;
  const reducedMotion = useReducedMotion();

  const jump = (event: MouseEvent<HTMLAnchorElement>, slug: string) => {
    const section = document.getElementById(hubSectionId(slug));
    if (!section) return;
    event.preventDefault();
    section.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
    window.history.replaceState(null, "", `#${hubSectionId(slug)}`);
    document
      .getElementById(hubSectionHeadingId(slug))
      ?.focus({ preventScroll: true });
  };

  return (
    <nav aria-label={t.chipsAria} className={className}>
      <ul className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <li key={chip.slug}>
            <a
              href={`#${hubSectionId(chip.slug)}`}
              onClick={(event) => jump(event, chip.slug)}
              aria-label={t.chipAria(chip.name, chip.count)}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-full bg-card px-3.5 text-sm font-semibold text-foreground",
                "transition-all duration-200 ease-out hover:-translate-y-px hover:shadow-card active:scale-98",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100",
              )}
            >
              <HubCategoryIcon
                slug={chip.slug}
                className="size-4 text-muted-foreground"
              />
              {chip.name}
              <small className="text-sm font-medium text-muted-foreground tabular-nums">
                {dict.devicePages.formatCount(chip.count)}
              </small>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
