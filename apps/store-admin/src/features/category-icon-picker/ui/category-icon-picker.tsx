"use client";

import { forwardRef, useMemo, useState, type ComponentProps } from "react";
import { ChevronDown, Search } from "lucide-react";

import {
  categoryIconLabel,
  isCategoryIconKey,
  type CategoryIconKey,
} from "@/entities/category";
import { dict } from "@/shared/config";
// Direct import: the `@/shared/lib` barrel must stay free of client modules.
import { useMediaQuery } from "@/shared/lib/use-media-query";
import { cn } from "@/shared/lib/utils";
import {
  Button,
  CategoryIcon,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui";

import { filterCategoryIcons } from "../model/icon-picker-model";
import { IconGrid } from "./icon-grid";

const t = dict.categoryForm.icon;

/** Below `md` the picker is a bottom sheet (mockup artboard «1m · 390»). */
const PHONE_QUERY = "(max-width: 767.98px)";

export interface CategoryIconPickerProps {
  /** The trigger's id — the field's `<Label htmlFor>`. */
  id: string;
  /** The current key, "" for none. */
  value: string;
  onChange: (key: string) => void;
  /** Keys set on another root category — a dot in the grid, never a block. */
  usedKeys?: ReadonlySet<string>;
  /** Offer «Без іконки» (a subcategory, where an icon is optional). */
  allowClear?: boolean;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

/**
 * CategoryIconPicker (TASK-1956, CategoryIconPicker mockup) — a trigger that
 * shows the chosen icon and its label, opening a searchable icon grid: a
 * popover from `md` (a pick writes to the form at once, so the live preview
 * follows; click or Enter closes it), a bottom sheet below `md` (the pick is
 * staged and committed by «Обрати «…»»; closing discards it).
 */
export function CategoryIconPicker({
  id,
  value,
  onChange,
  usedKeys,
  allowClear = false,
  disabled,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: CategoryIconPickerProps) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // The sheet's staged pick; the popover writes straight through.
  const [draft, setDraft] = useState("");
  const keys = useMemo(() => filterCategoryIcons(query), [query]);

  const onOpenChange = (next: boolean) => {
    if (next) {
      setQuery("");
      setDraft(value);
    }
    setOpen(next);
  };

  const pick = (key: CategoryIconKey) => {
    onChange(key);
  };
  const clear = () => {
    onChange("");
    setOpen(false);
  };

  const trigger = (
    <IconTrigger
      id={id}
      value={value}
      disabled={disabled}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
    />
  );

  const empty = keys.length === 0 && (
    <p className="py-2 text-sm text-muted-foreground">{t.noResults}</p>
  );

  if (isPhone) {
    const draftKey = isCategoryIconKey(draft) ? draft : null;
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          aria-describedby={undefined}
          showCloseButton={false}
          className="max-h-4/5 gap-3 rounded-t-xl p-4"
        >
          <span
            aria-hidden="true"
            className="h-1 w-10 self-center rounded-full bg-muted"
          />
          <SheetTitle className="text-base">{t.sheetTitle}</SheetTitle>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder={t.searchPlaceholderShort}
            className="text-base"
          />
          <div className="min-h-0 overflow-y-auto">
            <IconGrid
              value={draft}
              onValueChange={setDraft}
              keys={keys}
              columns={6}
            />
            {empty}
          </div>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={!draftKey}
              onClick={() => {
                if (!draftKey) return;
                onChange(draftKey);
                setOpen(false);
              }}
            >
              {draftKey ? t.choose(categoryIconLabel(draftKey)) : t.placeholder}
            </Button>
            {allowClear && value && (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={clear}
              >
                {t.none}
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  const hasUsed = keys.some((key) => usedKeys?.has(key));
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex w-(--radix-popover-trigger-width) max-w-130 flex-col gap-3 rounded-lg p-3"
      >
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={t.searchPlaceholder}
        />
        <IconGrid
          value={value}
          onValueChange={pick}
          onCommit={() => setOpen(false)}
          keys={keys}
          usedKeys={usedKeys}
          columns={8}
          withTooltips
        />
        {empty}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          {hasUsed ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-muted-foreground/50"
              />
              {t.used}
            </span>
          ) : (
            <span />
          )}
          <span className="inline-flex items-center gap-2">
            {t.keysHint}
            {allowClear && value && (
              <Button type="button" variant="ghost" size="xs" onClick={clear}>
                {t.none}
              </Button>
            )}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The closed field: a 32 px swatch, the label, a chevron. */
const IconTrigger = forwardRef<
  HTMLButtonElement,
  ComponentProps<"button"> & { value: string }
>(function IconTrigger({ value, className, ...props }, ref) {
  const set = isCategoryIconKey(value);
  return (
    <button
      ref={ref}
      type="button"
      aria-haspopup="dialog"
      className={cn(
        "flex h-11 w-full items-center gap-2.5 rounded-md border border-input bg-background pr-3 pl-1.5 text-left text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive data-[state=open]:border-ring data-[state=open]:ring-3 data-[state=open]:ring-ring/25 motion-reduce:transition-none",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-sm",
          set
            ? "bg-muted"
            : "border border-dashed border-warning/70 text-muted-foreground",
        )}
      >
        <CategoryIcon icon={value} className="size-5" />
      </span>
      <span className={cn("truncate", !set && "text-muted-foreground")}>
        {set ? categoryIconLabel(value) : t.placeholder}
      </span>
      <ChevronDown
        aria-hidden="true"
        className="ml-auto size-4 shrink-0 text-muted-foreground"
      />
    </button>
  );
});

function SearchField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className="relative">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={t.searchAria}
        autoComplete="off"
        className={cn("pl-9", className)}
      />
    </div>
  );
}
