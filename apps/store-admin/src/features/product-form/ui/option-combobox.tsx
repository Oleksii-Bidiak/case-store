"use client";

/**
 * OptionCombobox — a type-to-filter picker for a field that stores an ID
 * (TASK-423).
 *
 * ── Why the product form needed this ────────────────────────────────────────
 * Its three reference pickers are the worst case for a `Select`: the category
 * list is every LEAF of the whole admin tree, the brand list is the whole brand
 * table, and both run well past a hundred options on a real catalogue. A Radix
 * `Select` offers exactly one way to find an entry in that list — scroll — and
 * the owner's audit found it, together with the panel's other "select grows while
 * scrolling" complaint.
 *
 * ── The state-sync rule this exists to get right ─────────────────────────────
 * The visible text is a LABEL, but the form field holds an ID, and the mapping
 * between them arrives asynchronously. So on an edit page the sequence is: the
 * form is seeded with `categoryId`, the options are still empty, and the label
 * for that id is therefore unknown — it becomes known one refetch later. That is
 * docs/conventions/forms.md rule 1b with the async source being the OPTIONS
 * rather than the URL: the field stays mounted, and the text is re-seeded only
 * when the RESOLVED label changes from outside, never while the operator is
 * mid-word. A `key`-remount here would drop focus on every keystroke.
 *
 * ── And the rule the blur handler enforces ──────────────────────────────────
 * A combobox can be left showing text that matches nothing, while the form still
 * holds the previous id. That is a lie on screen about what will be saved, so
 * leaving the field restores the selected option's label. The handler sits on the
 * WRAPPER rather than on `Combobox` (which takes no `onBlur`): focusout bubbles,
 * and picking an option cannot trigger it because the listbox suppresses the
 * mousedown that would blur the input.
 */

import * as React from "react";

import { Combobox, type ComboboxOption } from "@/shared/ui";
import { dict } from "@/shared/config";

const t = dict.productForm;

export interface OptionComboboxProps {
  /** DOM id for the input — pair it with the field's `<Label htmlFor>`. */
  id: string;
  /** Currently selected id. `""` = nothing selected. */
  value: string;
  /** Fired with the new id, or `""` when the operator clears the field. */
  onChange: (value: string) => void;
  options: ComboboxOption[];
  isLoading?: boolean;
  /** Placeholder for the empty field (e.g. «Оберіть категорію»). */
  placeholder?: string;
  /**
   * Label of the "nothing selected" entry, e.g. «Без групи». Omit for a REQUIRED
   * field — then there is no way to clear it, which is the point.
   */
  clearLabel?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

/** The visible label for the currently-selected id, or `""` while unknown. */
function labelOf(options: ComboboxOption[], value: string): string {
  if (value === "") return "";
  return options.find((option) => option.value === value)?.label ?? "";
}

export function OptionCombobox({
  id,
  value,
  onChange,
  options,
  isLoading = false,
  placeholder = t.comboboxPlaceholder,
  clearLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: OptionComboboxProps) {
  const selectedLabel = labelOf(options, value);
  const [text, setText] = React.useState(selectedLabel);

  // The label this component last put in the box. An incoming `selectedLabel`
  // that differs is a genuine external change — a different entity, or the
  // options finally resolving the seeded id — and only then is the box re-seeded.
  const seededRef = React.useRef(selectedLabel);
  React.useEffect(() => {
    if (selectedLabel !== seededRef.current) {
      setText(selectedLabel);
      seededRef.current = selectedLabel;
    }
  }, [selectedLabel]);

  const needle = text.trim().toLowerCase();
  // While the box still shows the selection verbatim, show the WHOLE list: the
  // operator opening a picker to change their mind must not be handed a
  // one-entry list filtered by what is already chosen.
  const matches =
    needle === "" || text === selectedLabel
      ? options
      : options.filter((option) => option.label.toLowerCase().includes(needle));

  const visible: ComboboxOption[] =
    clearLabel !== undefined
      ? [{ value: "", label: clearLabel }, ...matches]
      : matches;

  return (
    <div
      onBlur={() => {
        // Never leave text on screen that disagrees with what would be saved.
        if (text !== selectedLabel) setText(selectedLabel);
      }}
    >
      <Combobox
        id={id}
        value={text}
        options={visible}
        isLoading={isLoading}
        placeholder={placeholder}
        loadingText={t.loading}
        emptyText={t.comboboxEmpty}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        onInputChange={setText}
        onSelect={(option) => {
          setText(option.label === clearLabel ? "" : option.label);
          seededRef.current = option.label === clearLabel ? "" : option.label;
          onChange(option.value);
        }}
      />
    </div>
  );
}
