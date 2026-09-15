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
  /** Currently selected category SLUG (from `?category=`), if any (TASK-420). */
  activeCategorySlug?: string;
  /**
   * Select a category (`undefined` = all categories). The caller writes the
   * choice to the `?category=` URL param — a SLUG since TASK-420, so a shared
   * catalogue link reads `?category=phone-cases` and the API resolves it. A
   * child slug is written exactly like a root one, so the single-value URL
   * contract (TASK-216) is unchanged.
   */
  onSelect: (categorySlug: string | undefined) => void;
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
  activeCategorySlug,
  onSelect,
}: CategoryChipsProps) {
  if (categories.length === 0) {
    return null;
  }

  // The root whose subtree is currently in focus: either it is directly
  // selected, or one of its direct children is. Drives the second-row reveal.
  const activeRoot = activeCategorySlug
    ? categories.find(
        (root) =>
          root.slug === activeCategorySlug ||
          root.children.some((child) => child.slug === activeCategorySlug),
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
          aria-pressed={!activeCategorySlug}
          onClick={() => onSelect(undefined)}
          className={`${chipBase} ${!activeCategorySlug ? chipActive : chipIdle}`}
        >
          {dict.filters.allCategories}
        </button>
        {categories.map((category) => {
          const active = category.slug === activeCategorySlug;
          return (
            <button
              key={category.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(active ? undefined : category.slug)}
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
            const active = child.slug === activeCategorySlug;
            return (
              <button
                key={child.id}
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(active ? undefined : child.slug)}
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
