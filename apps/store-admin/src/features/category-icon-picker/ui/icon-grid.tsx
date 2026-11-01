"use client";

import { Fragment, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { categoryIconLabel, type CategoryIconKey } from "@/entities/category";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import {
  CategoryIcon,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui";

const t = dict.categoryForm.icon;

export interface IconGridProps {
  /** The checked key, "" for none. */
  value: string;
  onValueChange: (key: CategoryIconKey) => void;
  /** A deliberate pick — a pointer click or Enter (closes the popover). */
  onCommit?: (key: CategoryIconKey) => void;
  keys: readonly CategoryIconKey[];
  /** Keys set on another root — a dot, never a block. */
  usedKeys?: ReadonlySet<string>;
  columns: 6 | 8;
  /** Hover/focus label bubbles (the popover); the sheet has none. */
  withTooltips?: boolean;
  className?: string;
}

const GRID_COLUMNS = { 6: "grid-cols-6", 8: "grid-cols-8" } as const;

/** Arrow → cell offset; rows depend on the column count. */
const ARROW_STEP: Readonly<Record<string, 1 | -1 | "row" | "-row">> = {
  ArrowRight: 1,
  ArrowLeft: -1,
  ArrowDown: "row",
  ArrowUp: "-row",
};

/**
 * IconGrid — the category icons as one Radix RadioGroup (the SwatchPicker
 * pattern): one tab stop, ← → move and select linearly, ↑ ↓ jump a row. Every
 * cell is named by its label, since the glyph alone says nothing to a screen
 * reader; a used key adds « — вже в іншій кореневій категорії».
 */
export function IconGrid({
  value,
  onValueChange,
  onCommit,
  keys,
  usedKeys,
  columns,
  withTooltips = false,
  className,
}: IconGridProps) {
  const cells = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onCommit?.(keys[index]);
      return;
    }
    const step = ARROW_STEP[event.key];
    if (step === undefined) return;
    // The arrows are ours, not Radix's roving step (a prevented event skips
    // its handler): ↑ ↓ jump a whole row, and every move selects synchronously
    // — Radix focuses on a timer and selects only if the key is still down,
    // which a quick tap can miss. At an edge the focus stays put.
    event.preventDefault();
    const target =
      index + (step === "row" ? columns : step === "-row" ? -columns : step);
    const cell = cells.current[target];
    if (target < 0 || target >= keys.length || !cell) return;
    cell.focus();
    onValueChange(keys[target]);
  };

  // `detail` is 0 for the synthetic click Radix fires when an arrow key moves
  // focus — only a real pointer click commits (and closes the popover).
  const onClick = (
    event: MouseEvent<HTMLButtonElement>,
    key: CategoryIconKey,
  ) => {
    if (event.detail > 0) onCommit?.(key);
  };

  return (
    <RadioGroupPrimitive.Root
      data-slot="icon-grid"
      aria-label={t.gridAria}
      value={value}
      onValueChange={(next) => onValueChange(next as CategoryIconKey)}
      loop={false}
      className={cn("grid gap-1", GRID_COLUMNS[columns], className)}
    >
      {keys.map((key, index) => {
        const label = categoryIconLabel(key);
        const used = usedKeys?.has(key) ?? false;
        const item = (
          <RadioGroupPrimitive.Item
            ref={(node) => {
              cells.current[index] = node;
            }}
            value={key}
            aria-label={used ? `${label} — ${t.used}` : label}
            onKeyDown={(event) => onKeyDown(event, index)}
            onClick={(event) => onClick(event, key)}
            className="relative grid aspect-square place-items-center rounded-sm border border-transparent text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=checked]:border-primary data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary motion-reduce:transition-none"
          >
            <CategoryIcon icon={key} className="size-5" />
            {used && (
              <span
                aria-hidden="true"
                data-used-dot=""
                className="absolute top-1 right-1 size-1.5 rounded-full bg-muted-foreground/50"
              />
            )}
          </RadioGroupPrimitive.Item>
        );
        return withTooltips ? (
          <Tooltip key={key}>
            <TooltipTrigger asChild>{item}</TooltipTrigger>
            <TooltipContent side="top">{label}</TooltipContent>
          </Tooltip>
        ) : (
          <Fragment key={key}>{item}</Fragment>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}
