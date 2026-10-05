"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";

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
  /** Focus the input on mount (a panel that opens on demand — TASK-411). */
  autoFocus?: boolean;
  "aria-invalid"?: boolean;
  /** Links the input to an external error message element (form a11y). */
  "aria-describedby"?: string;
  /** Extra classes merged onto the underlying input (e.g. left padding for an icon). */
  className?: string;
}

/**
 * Combobox — a controlled async autocomplete built on the shared `<Input>`.
 * Free-text friendly: the typed `value` is always preserved, so a caller can
 * submit raw text even when nothing is selected (the Nova Poshta free-text
 * fallback). Selecting an option emits it via `onSelect`.
 *
 * Accessibility: WAI-ARIA combobox pattern — `role="combobox"` +
 * `aria-expanded`/`aria-controls`/`aria-activedescendant`, a `role="listbox"`
 * popup, and ArrowUp/ArrowDown/Enter/Escape keyboard navigation. From the
 * input with nothing highlighted, ↓ goes to the first option and ↑ to the last
 * (TASK-508). Home/End stay the textbox's caret keys, as in the APG
 * list-autocomplete example: with an option highlighted they hand visual focus
 * back to the input (the highlight drops) and the caret moves natively.
 *
 * `activeIndex` is the KEYBOARD selection and nothing else (TASK-411): hovering
 * an option tints it through CSS `:hover` but never moves the selection, so a
 * cursor resting over the popup cannot change what Enter commits.
 *
 * Placement (TASK-502): the list is a Radix Popover anchored to the input and
 * portalled to <body>, so no `overflow` ancestor can clip it, and Radix's
 * collision handling flips it above the input when the room below runs out
 * (the NP city/branch pickers near the bottom of a phone screen). Its height is
 * `max-h-listbox` — the old 15rem, capped by the room Radix measured on the
 * chosen side. DOM focus never leaves the input: Radix's open/close auto-focus
 * is cancelled, and a mousedown anywhere in the popup is swallowed so the input
 * does not blur (Radix makes the popup focusable via `tabIndex=-1`, so without
 * that even a click on its padding or scrollbar would close it).
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
  autoFocus = false,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const anchorRef = React.useRef<HTMLDivElement>(null);

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

  // The list scrolls inside a 15rem box, so a keyboard walk past its edge must
  // bring the highlighted row into view — focus stays on the input, so the
  // browser will not do it for us.
  React.useEffect(() => {
    if (!activeDescendantId) return;
    document
      .getElementById(activeDescendantId)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeDescendantId]);

  function close() {
    setOpen(false);
    setActiveIndex(-1);
  }

  function select(option: ComboboxOption) {
    onSelect(option);
    close();
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
        if (!open) {
          setOpen(true);
          return;
        }
        // APG combobox (TASK-508): ↑ from the input — nothing highlighted yet —
        // lands on the LAST option, the mirror of ↓ landing on the first.
        setActiveIndex((i) =>
          i < 0 ? options.length - 1 : Math.max(i - 1, 0),
        );
        break;
      case "Home":
      case "End":
        // Caret keys of the textbox — no preventDefault. Visual focus returns
        // to the input, so Enter afterwards commits the typed text, not a row.
        setActiveIndex(-1);
        break;
      case "Enter":
        if (open && activeIndex >= 0 && options[activeIndex]) {
          e.preventDefault();
          select(options[activeIndex]);
        }
        break;
      case "Escape":
        close();
        break;
    }
  }

  return (
    <PopoverPrimitive.Root
      open={showList}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <PopoverPrimitive.Anchor asChild>
        <div ref={anchorRef} className="relative">
          <Input
            id={id}
            role="combobox"
            className={className}
            aria-expanded={showList}
            // Only while the listbox exists: a closed list is not in the DOM, and a
            // dangling IDREF is an axe `aria-valid-attr-value` failure.
            aria-controls={showList ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={activeDescendantId}
            autoComplete={autoComplete}
            autoFocus={autoFocus}
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
            onBlur={close}
            onKeyDown={handleKeyDown}
          />
        </div>
      </PopoverPrimitive.Anchor>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          asChild
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          // Focus belongs to the input for the whole life of the popup.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          // A press on the input itself is not "outside": without this, Radix
          // would dismiss the list and the already-focused input would never
          // fire `focus` again to reopen it.
          onInteractOutside={(e) => {
            if (anchorRef.current?.contains(e.target as Node)) {
              e.preventDefault();
            }
          }}
        >
          <ul
            id={listId}
            role="listbox"
            className="z-50 max-h-listbox w-(--radix-popover-trigger-width) overflow-auto rounded-md border border-border bg-card py-1 text-card-foreground shadow-md"
            // Keep the input focused: the popup is portalled and focusable, so a
            // press anywhere in it (a row, the padding, the scrollbar) would
            // otherwise blur the input before a click could select.
            onMouseDown={(e) => e.preventDefault()}
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
                    // Hover is a pointer affordance only — it tints the row but
                    // leaves `activeIndex` (what Enter commits) untouched.
                    "cursor-pointer px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                    i === activeIndex && "bg-accent text-accent-foreground",
                  )}
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
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
