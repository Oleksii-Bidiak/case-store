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

  function select(option: ComboboxOption) {
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
        setActiveIndex((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
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
                className={cn(
                  "cursor-pointer px-3 py-2 text-sm",
                  i === activeIndex && "bg-accent text-accent-foreground",
                )}
                // Prevent the input's blur from firing before the click selects.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => select(option)}
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
