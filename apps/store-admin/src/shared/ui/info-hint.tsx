"use client";

import * as React from "react";
import { InfoIcon } from "lucide-react";
import type { VariantProps } from "class-variance-authority";

import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import { badgeVariants } from "./badge";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export interface InfoHintProps {
  /** The explanation. Plain text reads best — it is also the description. */
  hint: React.ReactNode;
  /**
   * What the trigger shows: a chip's text («Позиція недоступна»), an
   * abbreviation, a short status. Omit for a bare «ⓘ» placed next to the thing
   * it explains (a column header, a disabled button).
   */
  children?: React.ReactNode;
  /** Draw the trigger as a `Badge` of this variant; omit for inline text. */
  badgeVariant?: VariantProps<typeof badgeVariants>["variant"];
  /**
   * Accessible name. A chip is named by its visible text, so this is only
   * needed there to override it; a bare «ⓘ» defaults to «Пояснення».
   */
  label?: string;
  /** Hide the «ⓘ» glyph — only where the trigger already reads as a hint (an abbreviation). */
  hideIcon?: boolean;
  className?: string;
  contentClassName?: string;
}

/**
 * InfoHint (TASK-1978) — an explanation attached to a chip, a status or an
 * abbreviation that every input method can reach.
 *
 * A native `title` shows nothing on a touch screen, nothing on keyboard focus,
 * and nothing hints that it is there. Here the trigger is a real `<button>`
 * with a visible «ⓘ»:
 * - pointer hover and keyboard focus → a Tooltip (the quick look);
 * - click, tap, Enter or Space → a Popover that stays until Escape, an outside
 *   click or a second tap (Radix returns focus to the trigger);
 * - assistive tech gets the same sentence as the button's description.
 *
 * Not for icon-only buttons — those keep their `aria-label` and get a plain
 * Tooltip (the click is the button's own action, not "explain").
 */
export function InfoHint({
  hint,
  children,
  badgeVariant,
  label,
  hideIcon = false,
  className,
  contentClassName,
}: InfoHintProps) {
  const hintId = React.useId();
  const [popoverOpen, setPopoverOpen] = React.useState(false);
  const [tooltipOpen, setTooltipOpen] = React.useState(false);
  const bare = children === undefined || children === null;

  return (
    <>
      <Popover
        open={popoverOpen}
        onOpenChange={(open) => {
          setPopoverOpen(open);
          // One surface at a time: the pinned popover replaces the hover tip.
          if (open) setTooltipOpen(false);
        }}
      >
        <Tooltip
          open={tooltipOpen && !popoverOpen}
          onOpenChange={setTooltipOpen}
        >
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                data-slot="info-hint"
                aria-label={
                  label ?? (bare ? dict.common.infoHintAria : undefined)
                }
                aria-describedby={hintId}
                className={cn(
                  "cursor-help outline-none",
                  badgeVariant
                    ? badgeVariants({ variant: badgeVariant })
                    : "inline-flex items-center gap-1 rounded-xs focus-visible:ring-3 focus-visible:ring-ring/50",
                  bare && "text-muted-foreground hover:text-foreground",
                  className,
                )}
              >
                {children}
                {hideIcon ? null : (
                  <InfoIcon
                    aria-hidden="true"
                    className={cn(
                      "shrink-0",
                      badgeVariant ? "size-3" : "size-3.5",
                    )}
                  />
                )}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent className={cn("max-w-64", contentClassName)}>
            {hint}
          </TooltipContent>
        </Tooltip>
        <PopoverContent
          align="center"
          className={cn(
            "w-auto max-w-72 p-3 text-xs leading-snug",
            contentClassName,
          )}
        >
          {hint}
        </PopoverContent>
      </Popover>
      <span id={hintId} hidden>
        {hint}
      </span>
    </>
  );
}
