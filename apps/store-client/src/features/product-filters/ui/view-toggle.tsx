"use client";

import { LayoutGrid, List } from "lucide-react";
import { dict } from "@/shared/config";

export type CatalogView = "grid" | "list";

interface ViewToggleProps {
  view: CatalogView;
  onChange: (view: CatalogView) => void;
  className?: string;
}

/**
 * Grid / list results view switch for the catalog toolbar. Segmented control
 * with two icon buttons; the active one is filled with the brand colour.
 */
export function ViewToggle({ view, onChange, className }: ViewToggleProps) {
  const buttonClass = (active: boolean) =>
    `inline-flex size-11 items-center justify-center rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div
      role="group"
      aria-label={dict.filters.viewToggleAria}
      className={`items-center gap-1 rounded-xl border-[1.5px] border-border bg-card p-1 ${className ?? ""}`}
    >
      <button
        type="button"
        aria-label={dict.filters.viewGrid}
        aria-pressed={view === "grid"}
        onClick={() => onChange("grid")}
        className={buttonClass(view === "grid")}
      >
        <LayoutGrid className="size-[18px]" />
      </button>
      <button
        type="button"
        aria-label={dict.filters.viewList}
        aria-pressed={view === "list"}
        onClick={() => onChange("list")}
        className={buttonClass(view === "list")}
      >
        <List className="size-[18px]" />
      </button>
    </div>
  );
}
