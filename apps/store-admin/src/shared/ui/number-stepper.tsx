"use client";

import * as React from "react";
import { MinusIcon, PlusIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { Button } from "./button";

export interface NumberStepperProps extends Omit<
  React.ComponentProps<"input">,
  "value" | "onChange" | "type" | "min" | "max"
> {
  /** The field's value as the form holds it — a string, possibly empty. */
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  /** «Менше» / «Більше» — the − and + buttons' names. */
  decreaseLabel: string;
  increaseLabel: string;
}

/**
 * NumberStepper — a small whole number with − and + on either side
 * (CarouselsProposal КР7 «Скільки товарів показувати», wave 198). The middle
 * stays a real `type="number"` input, so typing, the arrow keys and the
 * `spinbutton` role all keep working; the buttons clamp to `min`…`max` and
 * are 44 px on a phone. Presentational: the caller's schema validates.
 */
export function NumberStepper({
  value,
  onChange,
  min,
  max,
  decreaseLabel,
  increaseLabel,
  className,
  disabled,
  ...inputProps
}: NumberStepperProps) {
  const current = Number.parseInt(value, 10);
  const step = (delta: number) => {
    const base = Number.isFinite(current) ? current : min;
    onChange(String(Math.min(max, Math.max(min, base + delta))));
  };
  return (
    <div
      data-slot="number-stepper"
      className={cn(
        "inline-flex w-fit items-stretch overflow-hidden rounded-md border border-input",
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="rounded-none border-r border-input max-md:size-11"
        aria-label={decreaseLabel}
        disabled={disabled || (Number.isFinite(current) && current <= min)}
        onClick={() => step(-1)}
      >
        <MinusIcon aria-hidden="true" />
      </Button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-14 appearance-none bg-background text-center text-sm font-medium tabular-nums text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:text-destructive"
        {...inputProps}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="rounded-none border-l border-input max-md:size-11"
        aria-label={increaseLabel}
        disabled={disabled || (Number.isFinite(current) && current >= max)}
        onClick={() => step(1)}
      >
        <PlusIcon aria-hidden="true" />
      </Button>
    </div>
  );
}
