"use client";

import type { CategoryTreeNodeEntity } from "@/entities/category";
import { dict } from "@/shared/config";

interface CategoryChipsProps {
  /**
   * Root categories to offer, each carrying its `children` (from the public
   * `GET /categories/tree` payload — no extra request). The root row toggles the
   * top-level filter; when a root (or one of its children) is active a second
   * row of that root's direct children is revealed (TASK-236).
   */
  categories: CategoryTreeNodeEntity[];
  /** Currently selected category id (from `?categoryId=`), if any. */
  activeCategoryId?: string;
  /**
   * Select a category (`undefined` = all categories). The caller writes the
   * choice to the `?categoryId=` URL param — the same catalog URL contract the
   * old sidebar control used. A child id is written exactly like a root id, so
   * the single-id URL contract (TASK-216) is unchanged.
   */
  onSelect: (categoryId: string | undefined) => void;
}

const chipBase =
  "inline-flex h-9 shrink-0 items-center rounded-full border-[1.5px] px-4 text-sm font-semibold whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";
const chipActive = "border-primary bg-primary text-primary-foreground";
const chipIdle =
  "border-border bg-card text-foreground hover:border-primary/40";

/**
 * CategoryChips (TASK-216 + TASK-236) — horizontal, scrollable row of category
 * toggles shown above the catalog grid. A leading «Всі категорії» chip clears
 * the selection; clicking the active chip also deselects it.
 *
 * TASK-236 adds progressive disclosure: selecting a root chip (or landing on a
 * subcategory via the URL) reveals a secondary row of that root's DIRECT
 * children so shoppers can narrow to a leaf. This is purely a UX affordance —
 * the backend subtree rollup already makes the parent chip alone return the
 * whole subtree — so the children are threaded from the already-fetched tree
 * payload rather than fetched again.
 */
export function CategoryChips({
  categories,
  activeCategoryId,
  onSelect,
}: CategoryChipsProps) {
  if (categories.length === 0) {
    return null;
  }

  // The root whose subtree is currently in focus: either it is directly
  // selected, or one of its direct children is. Drives the second-row reveal.
  const activeRoot = activeCategoryId
    ? categories.find(
        (root) =>
          root.id === activeCategoryId ||
          root.children.some((child) => child.id === activeCategoryId),
      )
    : undefined;

  const subcategories = activeRoot?.children ?? [];

  return (
    <div className="mb-5 flex flex-col gap-2">
      <div
        role="group"
        aria-label={dict.filters.categoryChipsAria}
        className="flex items-center gap-2 overflow-x-auto pb-1"
      >
        <button
          type="button"
          aria-pressed={!activeCategoryId}
          onClick={() => onSelect(undefined)}
          className={`${chipBase} ${!activeCategoryId ? chipActive : chipIdle}`}
        >
          {dict.filters.allCategories}
        </button>
        {categories.map((category) => {
          const active = category.id === activeCategoryId;
          return (
            <button
              key={category.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(active ? undefined : category.id)}
              className={`${chipBase} ${active ? chipActive : chipIdle}`}
            >
              {category.name}
            </button>
          );
        })}
      </div>

      {subcategories.length > 0 && (
        <div
          role="group"
          aria-label={dict.filters.subcategoryChipsAria}
          className="flex items-center gap-2 overflow-x-auto pb-1 pl-1"
        >
          {subcategories.map((child) => {
            const active = child.id === activeCategoryId;
            return (
              <button
                key={child.id}
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(active ? undefined : child.id)}
                className={`${chipBase} ${active ? chipActive : chipIdle}`}
              >
                {child.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
