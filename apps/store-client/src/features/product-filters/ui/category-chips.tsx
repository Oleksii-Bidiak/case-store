"use client";

import type { CategoryEntity } from "@/entities/category";
import { dict } from "@/shared/config";

interface CategoryChipsProps {
  /** Root categories to offer (same list the sidebar used to render). */
  categories: CategoryEntity[];
  /** Currently selected category id (from `?categoryId=`), if any. */
  activeCategoryId?: string;
  /**
   * Select a category (`undefined` = all categories). The caller writes the
   * choice to the `?categoryId=` URL param — the same catalog URL contract the
   * old sidebar control used.
   */
  onSelect: (categoryId: string | undefined) => void;
}

const chipBase =
  "inline-flex h-9 shrink-0 items-center rounded-full border-[1.5px] px-4 text-sm font-semibold whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";
const chipActive = "border-primary bg-primary text-primary-foreground";
const chipIdle =
  "border-border bg-card text-foreground hover:border-primary/40";

/**
 * CategoryChips (TASK-216) — horizontal, scrollable row of category toggles
 * shown above the catalog grid. Replaces the «Категорія» card that used to sit
 * inside the sidebar filter stack, where it competed with price/search for
 * attention. A leading «Всі категорії» chip clears the selection; clicking the
 * active chip also deselects it.
 */
export function CategoryChips({
  categories,
  activeCategoryId,
  onSelect,
}: CategoryChipsProps) {
  if (categories.length === 0) {
    return null;
  }

  return (
    <div
      role="group"
      aria-label={dict.filters.categoryChipsAria}
      className="mb-5 flex items-center gap-2 overflow-x-auto pb-1"
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
  );
}
