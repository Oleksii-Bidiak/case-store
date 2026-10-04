"use client";

import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { cn } from "@/shared/lib/utils";

export interface SwatchOption<V extends string = string> {
  value: V;
  label: string;
  /**
   * Token classes painting the 20 px dot — `bg-primary`, `bg-sale`… Omit for
   * an option without a colour of its own («Своє…»).
   */
  dotClassName?: string;
}

export interface SwatchPickerProps<V extends string = string> extends Omit<
  React.ComponentProps<typeof RadioGroupPrimitive.Root>,
  "value" | "onValueChange" | "defaultValue" | "children"
> {
  value: V;
  onValueChange: (value: V) => void;
  options: readonly SwatchOption<V>[];
}

/**
 * SwatchPicker — a colour chosen from named samples (BannersProposal БН5
 * «Оформлення», wave 198): a wrapping row of pills, each a dot and its name,
 * so the colour is never the only signal. A Radix RadioGroup — one tab stop,
 * arrows move and select. Purely presentational: the caller owns the palette.
 */
export function SwatchPicker<V extends string = string>({
  value,
  onValueChange,
  options,
  className,
  ...props
}: SwatchPickerProps<V>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="swatch-picker"
      value={value}
      onValueChange={(next) => onValueChange(next as V)}
      orientation="horizontal"
      className={cn("flex flex-wrap gap-2", className)}
      {...props}
    >
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-background py-1.5 pr-3 pl-1.5 text-sm text-foreground outline-none transition-colors hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 data-[state=checked]:border-primary data-[state=checked]:ring-1 data-[state=checked]:ring-primary"
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-5 shrink-0 rounded-full border border-border",
              option.dotClassName ?? "border-dashed bg-background",
            )}
          />
          {option.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
