"use client";

import * as React from "react";
import { LockIcon } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { cn } from "@/shared/lib/utils";

export interface SegmentedOption<V extends string = string> {
  value: V;
  label: React.ReactNode;
  /**
   * Shown but not choosable — the segment is greyed out, carries a lock, and
   * arrow keys skip it (Radix). Means «you may not», never «not right now»:
   * CategoryDelete ДН-2.6 «Створити нову» without `categories:write`
   * (TASK-655). Say WHY next to the control and point `describedBy` at it —
   * a lock alone does not explain itself.
   */
  disabled?: boolean;
  /** Id of the text that explains this segment (e.g. why it is locked). */
  describedBy?: string;
}

export interface SegmentedControlProps<V extends string = string> extends Omit<
  React.ComponentProps<typeof RadioGroupPrimitive.Root>,
  "value" | "onValueChange" | "defaultValue" | "children"
> {
  value: V;
  onValueChange: (value: V) => void;
  options: readonly SegmentedOption<V>[];
  /**
   * `solid` (default) — outlined segments, the picked one filled with the
   * primary colour (BannersProposal БН5: a status that IS the form's subject).
   * `pill` — a white pill on a muted track (CategoryDelete ДН-2.2): a quieter
   * switch between two ways of answering one question. Its segments size to
   * their words and share what is left, so two short labels stay on one line
   * at 390 px (ДН-2.10) and wrap only when they truly do not fit.
   */
  variant?: "solid" | "pill";
}

/**
 * SegmentedControl — one choice out of two to four short words drawn as
 * joined segments (BannersProposal БН5 «Опубліковано · Чернетка ·
 * Заплановано», wave 198). A Radix RadioGroup: one tab stop, arrows move AND
 * select, as native radios do. 44 px tall on a phone; `solid` keeps equal
 * columns there, `pill` sizes each segment to its words.
 */
export function SegmentedControl<V extends string = string>({
  value,
  onValueChange,
  options,
  variant = "solid",
  className,
  ...props
}: SegmentedControlProps<V>) {
  const pill = variant === "pill";
  return (
    <RadioGroupPrimitive.Root
      data-slot="segmented-control"
      value={value}
      onValueChange={(next) => onValueChange(next as V)}
      orientation="horizontal"
      data-variant={variant}
      className={cn(
        pill
          ? "flex w-full gap-1 rounded-lg bg-muted p-1"
          : "grid w-full auto-cols-fr grid-flow-col overflow-hidden rounded-md border border-border md:inline-grid md:w-fit",
        className,
      )}
      {...props}
    >
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          aria-describedby={option.describedBy}
          className={cn(
            "inline-flex min-h-11 items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:text-muted-foreground motion-reduce:transition-none",
            pill
              ? // Still 44 px per segment on a phone — a touch target. The
                // idle words are `foreground/70`, not `muted-foreground`: on
                // the muted track the latter is only 4.34:1. A locked segment
                // takes the explicit disabled colour instead of half opacity
                // (TASK-735).
                "flex-auto rounded-md px-3 text-center text-foreground/70 disabled:text-disabled-foreground disabled:opacity-100 disabled:hover:text-disabled-foreground data-[state=checked]:bg-background data-[state=checked]:text-foreground data-[state=checked]:shadow-xs md:min-h-8"
              : "border-l border-border px-3.5 first:border-l-0 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground md:min-h-9",
          )}
        >
          {option.disabled ? (
            <LockIcon aria-hidden="true" className="size-3.5 shrink-0" />
          ) : null}
          {option.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
