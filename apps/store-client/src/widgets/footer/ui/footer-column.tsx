"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { FOCUS_ON_DARK_CLASS } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

import { FOOTER_HEADING } from "./footer-styles";

interface FooterColumnProps {
  title: string;
  /** Open on phones before the shopper touches it (Контакти). */
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * One footer link column (TASK-2078). Below `md` it is a disclosure — a real
 * button with `aria-expanded` / `aria-controls` inside the heading — and the
 * links are collapsed unless `defaultOpen`. From `md` the button is gone, a
 * plain heading shows, and the links are always visible: there is nothing to
 * collapse that a keyboard user could trip over. The links stay in the HTML
 * either way (only `display` changes), so crawlers and the no-JS render see
 * every one of them.
 */
export function FooterColumn({
  title,
  defaultOpen = false,
  children,
}: FooterColumnProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className="border-t border-footer-foreground/12 md:border-t-0">
      <h2 className={cn(FOOTER_HEADING, "hidden md:mb-3.5 md:block")}>
        {title}
      </h2>
      <h2 className={cn(FOOTER_HEADING, "md:hidden")}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className={cn(
            "flex min-h-13 w-full items-center justify-between gap-4 rounded-sm text-left",
            FOCUS_ON_DARK_CLASS,
          )}
        >
          {title}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-4.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </button>
      </h2>
      <div
        id={panelId}
        className={cn(
          "flex-col gap-0.5 pb-4 md:flex md:pb-0",
          open ? "flex" : "hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
}
