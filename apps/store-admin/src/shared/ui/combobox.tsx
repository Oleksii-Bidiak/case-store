"use client";

import * as React from "react";

import { cn } from "@/shared/lib/utils";
import { Input } from "./input";

export interface ComboboxOption {
  /** Stable value (e.g. an NP ref) emitted on select. */
  value: string;
  /** Visible primary label. */
  label: string;
  /** Optional secondary line shown under the label. */
  description?: string;
  /** Tree level, 0-based — indents the option (wave 198, category trees). */
  depth?: number;
  /**
   * Shown but not pickable — a tree branch heading among selectable leaves
   * (wave 198). Arrow keys skip it; click and Enter ignore it.
   */
  disabled?: boolean;
}

export interface ComboboxProps {
  id?: string;
  /** Current text shown in the input (controlled). */
  value: string;
  /** Fired on every keystroke with the raw input text. */
  onInputChange: (text: string) => void;
  /** Fired when the user picks an option (click or Enter). */
  onSelect: (option: ComboboxOption) => void;
  options: ComboboxOption[];
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  loadingText?: string;
  emptyText?: string;
  autoComplete?: string;
  "aria-invalid"?: boolean;
  /** Links the input to an external error message element (form a11y). */
  "aria-describedby"?: string;
  /** Extra classes merged onto the underlying input (e.g. left padding for an icon). */
  className?: string;
}

/**
 * Combobox — a controlled, zero-dependency async autocomplete built on the
 * shared `<Input>`. Free-text friendly: the typed `value` is always preserved,
 * so a caller can submit raw text even when nothing is selected (the Nova Poshta
 * free-text fallback). Selecting an option emits it via `onSelect`.
 *
 * Accessibility: WAI-ARIA combobox pattern — `role="combobox"` +
 * `aria-expanded`/`aria-controls`/`aria-activedescendant`, a `role="listbox"`
 * popup, and ArrowUp/ArrowDown/Enter/Escape keyboard navigation.
 *
 * ── Why store-admin has its own copy (TASK-423) ─────────────────────────────
 * A port of `apps/store-client/src/shared/ui/combobox.tsx`, verbatim apart from
 * this note: the two apps keep independent UI kits and must not import across
 * the app boundary (the same rule `use-debounced-callback` follows).
 *
 * It is here because the admin forms' long `Select`s were unusable — the product
 * form's category select lists the whole tree and its brand select the whole
 * brand table, and a Radix `Select` offers no way to narrow a hundred options
 * except scrolling. This is the type-to-filter answer, and it costs NO new
 * dependency: `cmdk` / `@radix-ui/react-popover` would have changed
 * `package-lock.json`, the one file guaranteed to conflict with the other waves
 * running in parallel.
 */
export function Combobox({
  id,
  value,
  onInputChange,
  onSelect,
  options,
  isLoading = false,
  disabled = false,
  placeholder,
  loadingText = "…",
  emptyText,
  autoComplete = "off",
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);

  // SSR-stable fallback so options always carry an id even when the caller
  // passes none (`useId`, never a random value — hydration must match).
  const generatedId = React.useId();
  const baseId = id ?? generatedId;
  const listId = `${baseId}-listbox`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const hasOptions = options.length > 0;
  const showEmpty =
    !isLoading && !hasOptions && value.trim().length > 0 && Boolean(emptyText);
  const showList = open && !disabled && (isLoading || hasOptions || showEmpty);

  // Same `activeIndex` drives the visual highlight and the ARIA pointer; the
  // attribute is absent whenever the list is closed or nothing is highlighted.
  const activeDescendantId =
    showList && activeIndex >= 0 && options[activeIndex]
      ? optionId(activeIndex)
      : undefined;

  /** The next pickable index from `from` in `step` direction, or `from`. */
  function nextEnabled(from: number, step: 1 | -1): number {
    for (let i = from + step; i >= 0 && i < options.length; i += step) {
      if (!options[i].disabled) return i;
    }
    return from;
  }

  function select(option: ComboboxOption) {
    if (option.disabled) return;
    onSelect(option);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        setActiveIndex((i) => nextEnabled(i, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => nextEnabled(i, -1));
        break;
      case "Enter":
        if (open && activeIndex >= 0 && options[activeIndex]) {
          e.preventDefault();
          select(options[activeIndex]);
        }
        break;
      case "Escape":
        setOpen(false);
        setActiveIndex(-1);
        break;
    }
  }

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        className={className}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeDescendantId}
        autoComplete={autoComplete}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        onChange={(e) => {
          onInputChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-card py-1 text-card-foreground shadow-md"
        >
          {isLoading && (
            <li
              role="presentation"
              className="px-3 py-2 text-sm text-muted-foreground"
            >
              {loadingText}
            </li>
          )}

          {showEmpty && (
            <li
              role="presentation"
              className="px-3 py-2 text-sm text-muted-foreground"
            >
              {emptyText}
            </li>
          )}

          {!isLoading &&
            options.map((option, i) => (
              <li
                key={option.value || option.label}
                id={optionId(i)}
                role="option"
                aria-selected={i === activeIndex}
                aria-disabled={option.disabled || undefined}
                className={cn(
                  "px-3 py-2 text-sm",
                  option.disabled
                    ? "cursor-default font-medium text-muted-foreground"
                    : "cursor-pointer",
                  i === activeIndex && "bg-accent text-accent-foreground",
                )}
                // Prevent the input's blur from firing before the click selects.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => {
                  if (!option.disabled) setActiveIndex(i);
                }}
                onClick={() => select(option)}
                style={
                  option.depth
                    ? { paddingInlineStart: 12 + option.depth * 16 }
                    : undefined
                }
              >
                <span className="block">{option.label}</span>
                {option.description && (
                  <span className="block text-xs text-muted-foreground">
                    {option.description}
                  </span>
                )}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
