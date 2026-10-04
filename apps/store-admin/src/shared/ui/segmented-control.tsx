"use client";

import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { cn } from "@/shared/lib/utils";

export interface SegmentedOption<V extends string = string> {
  value: V;
  label: React.ReactNode;
}

export interface SegmentedControlProps<V extends string = string> extends Omit<
  React.ComponentProps<typeof RadioGroupPrimitive.Root>,
  "value" | "onValueChange" | "defaultValue" | "children"
> {
  value: V;
  onValueChange: (value: V) => void;
  options: readonly SegmentedOption<V>[];
}

/**
 * SegmentedControl — one choice out of two to four short words drawn as
 * joined segments (BannersProposal БН5 «Опубліковано · Чернетка ·
 * Заплановано», wave 198). A Radix RadioGroup: one tab stop, arrows move AND
 * select, as native radios do. Equal columns on a phone, 44 px tall there.
 */
export function SegmentedControl<V extends string = string>({
  value,
  onValueChange,
  options,
  className,
  ...props
}: SegmentedControlProps<V>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="segmented-control"
      value={value}
      onValueChange={(next) => onValueChange(next as V)}
      orientation="horizontal"
      className={cn(
        "grid w-full auto-cols-fr grid-flow-col overflow-hidden rounded-md border border-border md:inline-grid md:w-fit",
        className,
      )}
      {...props}
    >
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          className="inline-flex min-h-11 items-center justify-center border-l border-border px-3.5 text-sm font-medium text-muted-foreground outline-none transition-colors first:border-l-0 hover:text-foreground focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground md:min-h-9"
        >
          {option.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
