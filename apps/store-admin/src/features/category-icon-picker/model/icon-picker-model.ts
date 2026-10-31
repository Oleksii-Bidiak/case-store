// Pure helpers of the category icon picker (TASK-1956): the search filter, the
// «already used» hint and the live preview's rows. Kept out of the components
// so they test without a DOM.

import {
  CATEGORY_ICON_KEYS,
  categoryIconLabel,
  type CategoryIconKey,
  type CategoryTreeItem,
} from "@/entities/category";

/**
 * Keys whose Ukrainian label OR English key contains `query` (case-insensitive
 * substring) — «зарядка» and «charger» both find `chargers`. No synonym table:
 * eleven icons do not need one.
 */
export function filterCategoryIcons(query: string): CategoryIconKey[] {
  const needle = query.trim().toLocaleLowerCase("uk-UA");
  if (!needle) return [...CATEGORY_ICON_KEYS];
  return CATEGORY_ICON_KEYS.filter(
    (key) =>
      key.includes(needle) ||
      categoryIconLabel(key).toLocaleLowerCase("uk-UA").includes(needle),
  );
}

/**
 * Keys already set on ANOTHER root category — a hint (the grid's dot), never a
 * block: two roots may share an icon.
 */
export function usedRootIcons(
  items: readonly CategoryTreeItem[],
  editedId: string | undefined,
): ReadonlySet<string> {
  const used = new Set<string>();
  for (const item of items) {
    if (item.parentId === null && item.id !== editedId && item.icon) {
      used.add(item.icon);
    }
  }
  return used;
}

export interface IconPreviewRow {
  id: string;
  name: string;
  icon: string | null;
  /** `subtreeProductCount`; null for a category that does not exist yet. */
  count: number | null;
  current: boolean;
}

/** How many sibling rows the «Меню «Каталог»» preview shows. */
const PREVIEW_ROWS = 4;

/**
 * The edited category among its siblings (roots for a root), in tree order,
 * up to four rows around it. The edited row carries the LIVE name and icon from
 * the form; a new category is appended at the end with no count.
 */
export function buildIconPreviewRows({
  items,
  editedId,
  parentId,
  name,
  icon,
  fallbackName,
}: {
  items: readonly CategoryTreeItem[];
  editedId: string | undefined;
  /** The form's parent ("" = root). */
  parentId: string;
  name: string;
  icon: string;
  /** Shown while the name field is still empty. */
  fallbackName: string;
}): IconPreviewRow[] {
  const parent = parentId || null;
  const liveName = name.trim() || fallbackName;
  const rows: IconPreviewRow[] = items
    .filter((item) => item.parentId === parent)
    .map((item) =>
      item.id === editedId
        ? {
            id: item.id,
            name: liveName,
            icon: icon || null,
            count: item.subtreeProductCount,
            current: true,
          }
        : {
            id: item.id,
            name: item.label,
            icon: item.icon,
            count: item.subtreeProductCount,
            current: false,
          },
    );
  if (!rows.some((row) => row.current)) {
    rows.push({
      id: editedId ?? "new",
      name: liveName,
      icon: icon || null,
      count: null,
      current: true,
    });
  }

  const at = rows.findIndex((row) => row.current);
  const start = Math.max(
    0,
    Math.min(at - Math.floor(PREVIEW_ROWS / 2), rows.length - PREVIEW_ROWS),
  );
  return rows.slice(start, start + PREVIEW_ROWS);
}

/** The two homepage tiles: the edited category and its next (or previous) sibling. */
export function iconPreviewTiles(
  rows: readonly IconPreviewRow[],
): IconPreviewRow[] {
  const at = rows.findIndex((row) => row.current);
  if (at < 0) return [];
  if (rows[at + 1]) return [rows[at], rows[at + 1]];
  return rows[at - 1] ? [rows[at - 1], rows[at]] : [rows[at]];
}
