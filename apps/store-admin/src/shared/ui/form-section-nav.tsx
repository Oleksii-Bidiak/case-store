"use client";

import * as React from "react";

import { cn } from "@/shared/lib/utils";
import { StatusDot, type StatusDotTone } from "./status-dot";

export interface FormSection {
  /** The section element's `id` — the anchor target. */
  id: string;
  label: string;
  status?: StatusDotTone;
  /** What the dot means: «є зміни», «заповнено», «є помилка». */
  statusLabel?: string;
}

export interface FormSectionNavProps {
  sections: readonly FormSection[];
  /** Controlled active section; omit to track the last one jumped to. */
  activeId?: string;
  "aria-label": string;
  className?: string;
}

/**
 * The section index of a long form (Product Ф1, Category КТ5, wave 198):
 * sticky in a left column on desktop, a horizontally scrolling row on a phone.
 * Plain in-page anchors, so the browser does the scrolling and focus moves
 * with the hash; the current one is `aria-current="location"`.
 */
export function FormSectionNav({
  sections,
  activeId,
  "aria-label": ariaLabel,
  className,
}: FormSectionNavProps) {
  const [jumped, setJumped] = React.useState<string | undefined>(undefined);
  const current = activeId ?? jumped ?? sections[0]?.id;
  return (
    <nav
      aria-label={ariaLabel}
      className={cn("md:sticky md:top-0 md:self-start", className)}
    >
      <ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:gap-0.5 md:overflow-visible md:px-0 md:pb-0">
        {sections.map((section) => {
          const active = section.id === current;
          return (
            <li key={section.id} className="shrink-0">
              <a
                href={`#${section.id}`}
                aria-current={active ? "location" : undefined}
                onClick={() => setJumped(section.id)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                  active && "bg-accent font-medium text-foreground",
                )}
              >
                {section.status ? (
                  <StatusDot
                    tone={section.status}
                    label={section.statusLabel ?? ""}
                  />
                ) : null}
                {section.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
