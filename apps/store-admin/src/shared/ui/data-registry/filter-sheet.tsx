"use client";

import * as React from "react";

import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import { Badge } from "../badge";
import { Button } from "../button";
import { Checkbox } from "../checkbox";
import { Input } from "../input";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../sheet";

const r = dict.common.registry;

/* ── Draft state ────────────────────────────────────────────────────────── */

export interface FilterDraft<T> {
  draft: T;
  /** Replace the whole draft. */
  setDraft: React.Dispatch<React.SetStateAction<T>>;
  /** Merge a patch into the draft. */
  update: (patch: Partial<T>) => void;
  /** Set the draft to `to` («Скинути» passes the empty filters). */
  reset: (to: T) => void;
}

/**
 * The sheet's edits are a DRAFT. It is seeded from what is APPLIED each time
 * the sheet opens — so closing without «Показати…» throws the edits away, and
 * reopening shows the truth again, not the abandoned draft. Render-time guard
 * (forms.md rule 1a): the reseed happens in the same render that opens it.
 */
export function useFilterDraft<T>(applied: T, open: boolean): FilterDraft<T> {
  const [draft, setDraft] = React.useState<T>(applied);
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(applied);
  }
  const update = React.useCallback(
    (patch: Partial<T>) => setDraft((current) => ({ ...current, ...patch })),
    [],
  );
  const reset = React.useCallback((to: T) => setDraft(to), []);
  return { draft, setDraft, update, reset };
}

/* ── Sheet ──────────────────────────────────────────────────────────────── */

export interface FilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** «Показати 27 замовлень» — the caller knows the count. */
  applyLabel: string;
  onApply: () => void;
  /** Clears the DRAFT. Applying is still the operator's separate step. */
  onReset: () => void;
  /** Disable «Показати…» (e.g. while the count for the draft is loading). */
  applyDisabled?: boolean;
  children: React.ReactNode;
}

/**
 * «Фільтри» (OrdersProposal П6, П8): a 420 px side sheet on desktop, the whole
 * screen below md. Esc, the overlay and the × close it without applying.
 */
export function FilterSheet({
  open,
  onOpenChange,
  applyLabel,
  onApply,
  onReset,
  applyDisabled = false,
  children,
}: FilterSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        aria-describedby={undefined}
        className="w-full gap-0 sm:max-w-none md:w-105"
      >
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="text-lg">{r.sheetTitle}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 flex-col overflow-y-auto px-5 py-1">
          {children}
        </div>
        <SheetFooter className="mt-0 flex-row justify-between border-t bg-background px-5 py-3">
          <Button type="button" variant="ghost" onClick={onReset}>
            {r.sheetReset}
          </Button>
          <Button type="button" onClick={onApply} disabled={applyDisabled}>
            {applyLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export interface FilterSectionProps {
  title: string;
  /** Dimmed note after the title — «— після плану 184». */
  suffix?: string;
  children: React.ReactNode;
  className?: string;
}

/** One block of the sheet: a 14/20 semibold title over its controls. */
export function FilterSection({
  title,
  suffix,
  children,
  className,
}: FilterSectionProps) {
  return (
    <section
      className={cn(
        "flex flex-col gap-2 border-b py-3.5 last:border-b-0",
        className,
      )}
    >
      <h3 className="text-sm font-semibold text-foreground">
        {title}
        {suffix ? (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </h3>
      {children}
    </section>
  );
}

/** The small «нове» tag. Same look as `Badge variant="new"`. */
export function NewTag() {
  return <Badge variant="new">{r.newTag}</Badge>;
}

/* ── Pills ──────────────────────────────────────────────────────────────── */

export interface PillOption {
  value: string;
  label: string;
  /** Appends the «нове» tag. */
  isNew?: boolean;
}

interface PillGroupBase {
  /** Accessible name of the group (usually the section title). */
  label: string;
  options: readonly PillOption[];
  className?: string;
}

export type PillGroupProps = PillGroupBase &
  (
    | {
        multiple?: false;
        value: string;
        onChange: (value: string) => void;
      }
    | {
        multiple: true;
        value: readonly string[];
        onChange: (value: string[]) => void;
      }
  );

/**
 * Pills — single choice (one is always pressed; picking another releases it)
 * or several. Toggle buttons with `aria-pressed` in a labelled group.
 */
export function PillGroup(props: PillGroupProps) {
  const { label, options, className } = props;
  const isOn = (value: string) =>
    props.multiple ? props.value.includes(value) : props.value === value;
  const pick = (value: string) => {
    if (props.multiple) {
      props.onChange(
        props.value.includes(value)
          ? props.value.filter((v) => v !== value)
          : [...props.value, value],
      );
    } else {
      props.onChange(value);
    }
  };
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex flex-wrap gap-1.5", className)}
    >
      {options.map((option) => {
        const on = isOn(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => pick(option.value)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border bg-background px-2.5 text-pill text-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50",
              on &&
                "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {option.label}
            {option.isNew ? <NewTag /> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ── Checklist ──────────────────────────────────────────────────────────── */

export interface CheckListItem {
  value: string;
  label: string;
  /** Right-aligned count, e.g. orders in that status. */
  count?: number;
  isNew?: boolean;
  /**
   * What the row means, for a screen reader (`aria-describedby`) — for a
   * terse label whose rule needs a sentence («Вікно оплати»).
   */
  description?: string;
  /** Nested rows — the parent shows mixed when only some are on. */
  children?: readonly CheckListItem[];
}

export interface CheckListProps {
  label: string;
  items: readonly CheckListItem[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  /** 1 (default) or 2 columns. */
  columns?: 1 | 2;
  className?: string;
}

function descendants(item: CheckListItem): string[] {
  return (item.children ?? []).flatMap((child) => [
    child.value,
    ...descendants(child),
  ]);
}

/**
 * Checkboxes, optionally in two columns, with counts and tree rows. Toggling a
 * parent selects or clears its whole branch; a parent's own state is derived
 * from its descendants, so «some of Чохли» reads as mixed, never as off.
 */
export function CheckList({
  label,
  items,
  value,
  onChange,
  columns = 1,
  className,
}: CheckListProps) {
  const selected = new Set(value);
  const baseId = React.useId();

  const stateOf = (item: CheckListItem): boolean | "indeterminate" => {
    const branch = descendants(item);
    if (branch.length === 0) return selected.has(item.value);
    const on = branch.filter((id) => selected.has(id)).length;
    if (on === branch.length) return true;
    return on > 0 || selected.has(item.value) ? "indeterminate" : false;
  };

  const toggle = (item: CheckListItem) => {
    const branch = [item.value, ...descendants(item)];
    const next = new Set(selected);
    if (stateOf(item) === true) for (const id of branch) next.delete(id);
    else for (const id of branch) next.add(id);
    onChange([...next]);
  };

  const rows: React.ReactNode[] = [];
  const walk = (list: readonly CheckListItem[], depth: number) => {
    for (const item of list) {
      const id = `${baseId}-${item.value}`;
      rows.push(
        <div
          key={item.value}
          className="flex items-center justify-between gap-2 text-sm"
          style={depth > 0 ? { paddingInlineStart: depth * 20 } : undefined}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Checkbox
              id={id}
              checked={stateOf(item)}
              onCheckedChange={() => toggle(item)}
              aria-describedby={item.description ? `${id}-desc` : undefined}
            />
            <label htmlFor={id} className="min-w-0 text-foreground">
              {item.label}
            </label>
            {item.description ? (
              <span id={`${id}-desc`} className="sr-only">
                {item.description}
              </span>
            ) : null}
            {item.isNew ? <NewTag /> : null}
          </span>
          {item.count !== undefined ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {item.count.toLocaleString("uk-UA")}
            </span>
          ) : null}
        </div>,
      );
      if (item.children) walk(item.children, depth + 1);
    }
  };
  walk(items, 0);

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "grid gap-x-4 gap-y-1.5",
        columns === 2 ? "grid-cols-2" : "grid-cols-1",
        className,
      )}
    >
      {rows}
    </div>
  );
}

/* ── Ranges ─────────────────────────────────────────────────────────────── */

export interface RangeValue {
  from: string;
  to: string;
}

export interface RangeInputsProps extends RangeValue {
  /** Names both inputs: «Сума: від», «Сума: до». */
  legend: string;
  onChange: (value: RangeValue) => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  className?: string;
}

/** «від» / «до» — raw strings; the caller validates and maps to the API. */
export function RangeInputs({
  legend,
  from,
  to,
  onChange,
  inputMode = "decimal",
  className,
}: RangeInputsProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      <Input
        inputMode={inputMode}
        value={from}
        placeholder={r.rangeFrom}
        aria-label={r.rangeFromAria(legend)}
        onChange={(event) => onChange({ from: event.target.value, to })}
      />
      <Input
        inputMode={inputMode}
        value={to}
        placeholder={r.rangeTo}
        aria-label={r.rangeToAria(legend)}
        onChange={(event) => onChange({ from, to: event.target.value })}
      />
    </div>
  );
}

export interface DateRangeProps extends RangeValue {
  legend: string;
  /** «Сьогодні», «Вчора», «7 днів», …, «Свій період». */
  presets: readonly { id: string; label: string }[];
  /** The active preset id, "" for none. */
  preset: string;
  onPresetChange: (preset: string) => void;
  /** `yyyy-mm-dd` strings, as `<input type="date">` speaks. */
  onChange: (value: RangeValue) => void;
  className?: string;
}

/** Period presets as pills, then «з» / «до» date inputs. */
export function DateRange({
  legend,
  presets,
  preset,
  onPresetChange,
  from,
  to,
  onChange,
  className,
}: DateRangeProps) {
  const fromId = React.useId();
  const toId = React.useId();
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <PillGroup
        label={legend}
        options={presets.map((p) => ({ value: p.id, label: p.label }))}
        value={preset}
        onChange={onPresetChange}
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={fromId} className="text-xs font-medium">
            {r.dateFrom}
          </label>
          <Input
            id={fromId}
            type="date"
            value={from}
            onChange={(event) => onChange({ from: event.target.value, to })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={toId} className="text-xs font-medium">
            {r.dateTo}
          </label>
          <Input
            id={toId}
            type="date"
            value={to}
            onChange={(event) => onChange({ from, to: event.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
