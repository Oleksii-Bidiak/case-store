"use client";

import * as React from "react";
import { Slider as SliderPrimitive } from "radix-ui";

import { cn } from "@/shared/lib/utils";

/**
 * Slider — thin wrapper around Radix Slider styled with design tokens. Supports
 * single or multi-thumb (range) usage: pass a two-element `value`/`defaultValue`
 * to get a draggable range with two handles. Each thumb is keyboard-operable
 * (arrows / Home / End) out of the box.
 *
 * `thumbLabels` gives each handle an accessible name (Radix does not forward an
 * `aria-label` from the root to individual thumbs); pass one entry per thumb.
 */
function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  thumbLabels,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  thumbLabels?: string[];
}) {
  const thumbValues = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max],
  );

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-1 grow overflow-hidden rounded-full bg-muted"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute h-full rounded-full bg-primary"
        />
      </SliderPrimitive.Track>
      {thumbValues.map((_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          aria-label={thumbLabels?.[index]}
          className="block size-4 shrink-0 cursor-grab rounded-full border-2 border-primary bg-background shadow-card transition-[box-shadow,transform] outline-none hover:ring-4 hover:ring-primary/20 focus-visible:ring-4 focus-visible:ring-ring/40 active:cursor-grabbing data-[disabled]:pointer-events-none"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
