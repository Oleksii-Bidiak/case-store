"use client";

import type { MouseEvent } from "react";
import { dict, FOCUS_RING } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { useReducedMotion } from "@/shared/lib/use-reduced-motion";
import { CategoryIcon } from "@/shared/ui";
import { hubSectionHeadingId, hubSectionId } from "../model/hub-copy";

export interface HubChip {
  slug: string;
  name: string;
  /** `Category.icon` (TASK-1956) — null/unknown renders the folder. */
  icon: string | null | undefined;
  count: number;
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
                "transition-interactive hover:-translate-y-px hover:shadow-card active:scale-98",
                FOCUS_RING,
                "motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100",
              )}
            >
              <CategoryIcon
                icon={chip.icon}
                size={16}
                className="text-muted-foreground"
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
