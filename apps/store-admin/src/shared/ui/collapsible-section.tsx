"use client";

import * as React from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import { Button } from "./button";

export interface CollapsibleSectionProps {
  title: string;
  /** One line that stands in for the content while collapsed. */
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  /** Controlled mode. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The section element's id — the `FormSectionNav` anchor. */
  id?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * A form section that can fold to a one-line summary (Product Ф1 «SEO і
 * соцмережі», wave 198) — for a block most edits never touch. The toggle says
 * what it will do («Розгорнути ▾» / «Згорнути ▴») and is wired with
 * `aria-expanded` / `aria-controls`.
 */
export function CollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  id,
  children,
  className,
}: CollapsibleSectionProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const headingId = React.useId();
  const contentId = React.useId();

  const toggle = () => {
    const next = !open;
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id={headingId} className="text-sm font-semibold text-foreground">
          {title}
        </h3>
        <Button
          type="button"
          variant="link"
          size="sm"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={toggle}
          className="h-auto px-0"
        >
          {open ? dict.canon.collapse : dict.canon.expand}
          {open ? (
            <ChevronUpIcon aria-hidden="true" />
          ) : (
            <ChevronDownIcon aria-hidden="true" />
          )}
        </Button>
      </div>
      {!open && summary ? (
        <p className="text-sm text-muted-foreground">{summary}</p>
      ) : null}
      <div id={contentId} hidden={!open}>
        {open ? children : null}
      </div>
    </section>
  );
}
