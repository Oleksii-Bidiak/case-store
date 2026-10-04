import * as React from "react";
import Link from "next/link";

import { cn } from "@/shared/lib/utils";

export interface SectionTab {
  /** Stable id — `activeId` names one of these. */
  id: string;
  label: string;
  href: string;
  /** Optional — omit rather than show a number the API does not give. */
  count?: number;
}

export interface SectionTabsProps {
  /** Names the navigation landmark, e.g. «Розділи блогу». */
  label: string;
  items: readonly SectionTab[];
  activeId: string;
  className?: string;
}

/**
 * Page-level tabs of a section (wave 198, BlogProposal БЛ1 «Статті · Категорії
 * · Автори»): each tab is its own ROUTE, so they are links in a `<nav>` with
 * `aria-current="page"` — not Radix `Tabs`, whose panels live in one page and
 * whose arrow-key model would promise in-place switching that does not happen.
 *
 * Dumb: the caller decides which tab is active and what each one counts.
 */
export function SectionTabs({
  label,
  items,
  activeId,
  className,
}: SectionTabsProps) {
  return (
    <nav
      aria-label={label}
      data-slot="section-tabs"
      className={cn("flex gap-1 border-b border-border", className)}
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-10",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">
                {item.count.toLocaleString("uk-UA")}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
