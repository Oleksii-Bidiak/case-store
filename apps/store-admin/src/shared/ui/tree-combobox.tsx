"use client";

import * as React from "react";

import { Combobox, type ComboboxOption } from "./combobox";

/** One node of a picker tree, flattened in display order. */
export interface TreeComboboxItem {
  value: string;
  label: string;
  /** 0-based level — indents the option while the list is not filtered. */
  depth: number;
  /** «Аксесуари › Чохли» — shown under a match while searching. */
  path?: string;
}

/** The shape every admin tree read shares (`id`, `name`, `children`). */
export interface TreeComboboxNode {
  id: string;
  name: string;
  children?: readonly TreeComboboxNode[] | null;
}

/**
 * Flatten a nested tree into picker items, depth-first, keeping each node's
 * ancestor path for the search results.
 */
export function treeComboboxItems(
  nodes: readonly TreeComboboxNode[] | null | undefined,
): TreeComboboxItem[] {
  const items: TreeComboboxItem[] = [];
  const walk = (
    list: readonly TreeComboboxNode[],
    depth: number,
    ancestors: string[],
  ) => {
    for (const node of list) {
      items.push({
        value: node.id,
        label: node.name,
        depth,
        path: ancestors.length > 0 ? ancestors.join(" › ") : undefined,
      });
      if (node.children?.length) {
        walk(node.children, depth + 1, [...ancestors, node.name]);
      }
    }
  };
  walk(nodes ?? [], 0, []);
  return items;
}

export interface TreeComboboxProps {
  id?: string;
  items: readonly TreeComboboxItem[];
  /** The picked value, `""` for none. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Said when the search matches nothing. */
  emptyText?: string;
  /** Adds a first option that clears the choice («Будь-яка категорія»). */
  clearLabel?: string;
  isLoading?: boolean;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  className?: string;
}

/**
 * Pick one node of a tree by typing (wave 198: product category in the form
 * and in the list's «Фільтри»). Unfiltered, the options are the whole tree with
 * real indentation — no «— » prefixes; once the operator types, matches are
 * listed flat with their ancestor path underneath, so «Чохли для iPhone» under
 * two different parents is still told apart.
 *
 * Built on the shared `Combobox` (WAI-ARIA combobox + listbox). While not
 * typing the input shows the picked node's name; leaving the field throws an
 * unfinished search away rather than treating it as a choice.
 */
export function TreeCombobox({
  id,
  items,
  value,
  onChange,
  placeholder,
  emptyText,
  clearLabel,
  isLoading,
  disabled,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  className,
}: TreeComboboxProps) {
  // `null` = not searching: the input shows the picked node's name.
  const [query, setQuery] = React.useState<string | null>(null);
  const selected = items.find((item) => item.value === value);
  const text = query ?? selected?.label ?? "";

  const options = React.useMemo<ComboboxOption[]>(() => {
    const needle = query?.trim().toLocaleLowerCase("uk-UA") ?? "";
    if (needle) {
      return items
        .filter((item) =>
          item.label.toLocaleLowerCase("uk-UA").includes(needle),
        )
        .map((item) => ({
          value: item.value,
          label: item.label,
          description: item.path,
        }));
    }
    const all: ComboboxOption[] = items.map((item) => ({
      value: item.value,
      label: item.label,
      depth: item.depth,
    }));
    return clearLabel ? [{ value: "", label: clearLabel }, ...all] : all;
  }, [clearLabel, items, query]);

  return (
    <div onBlur={() => setQuery(null)}>
      <Combobox
        id={id}
        value={text}
        onInputChange={setQuery}
        onSelect={(option) => {
          onChange(option.value);
          setQuery(null);
        }}
        options={options}
        isLoading={isLoading}
        disabled={disabled}
        placeholder={placeholder}
        emptyText={emptyText}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className={className}
      />
    </div>
  );
}
