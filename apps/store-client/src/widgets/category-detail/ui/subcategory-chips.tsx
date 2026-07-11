import Link from "next/link";
import type { CategoryTreeNodeEntity } from "@/entities/category";
import { dict } from "@/shared/config";

interface SubcategoryChipsProps {
  /**
   * Direct children of the current category (already present on the tree
   * node from `GET /categories/tree` — no extra request). Named `categories`
   * rather than `children` because React reserves the `children` prop
   * (eslint react/no-children-prop).
   */
  categories: CategoryTreeNodeEntity[];
}

const chip =
  "inline-flex h-9 shrink-0 items-center rounded-full border-[1.5px] border-border bg-card px-4 text-sm font-semibold whitespace-nowrap text-foreground outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring";

/**
 * SubcategoryChips (TASK-277) — a horizontal row of navigation links to the
 * direct subcategories of a `/categories/[slug]` landing page. Unlike
 * `CategoryChips` (a `?categoryId=` filter toggle on the catalog), these are
 * plain `<Link>` pills: clicking one navigates to that child's own landing
 * page. Renders nothing when the category has no children.
 */
export function SubcategoryChips({ categories }: SubcategoryChipsProps) {
  if (categories.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label={dict.filters.subcategoryChipsAria}
      className="mb-5 flex items-center gap-2 overflow-x-auto pb-1"
    >
      {categories.map((child) => (
        <Link
          key={child.id}
          href={`/categories/${child.slug}`}
          className={chip}
        >
          {child.name}
        </Link>
      ))}
    </nav>
  );
}
