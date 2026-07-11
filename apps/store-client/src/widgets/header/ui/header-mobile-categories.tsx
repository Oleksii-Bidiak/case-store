"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useCategoryControllerGetCategoryTree } from "@/entities/category";
import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

/**
 * Shared styling for links in the mobile Sheet menu. Lives here (not in
 * header.tsx) so the import direction stays one-way: header.tsx imports this
 * sub-widget, never the other way around.
 */
export const MOBILE_LINK_CLASS =
  "rounded-md px-3 py-2 text-base font-medium text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface HeaderMobileCategoriesProps {
  /** Close the parent Sheet on any navigation — mirrors every other mobile link in header.tsx. */
  onNavigate: () => void;
}

/**
 * HeaderMobileCategories — the "Каталог" section of the mobile Sheet menu
 * (TASK-082-B). Fetches the category tree itself (mirrors how HeaderCartBadge /
 * HeaderWishlistBadge own their fetches) and renders an accordion: each root is
 * a Link (navigates + closes the Sheet) plus, when it has children, a separate
 * sibling chevron button that expands/collapses its direct children in place
 * without navigating. Multiple roots can be open at once (same disclosure
 * pattern as the FAQ accordion in info-view.tsx).
 */
export function HeaderMobileCategories({
  onNavigate,
}: HeaderMobileCategoriesProps) {
  const { data, isPending, isError } = useCategoryControllerGetCategoryTree();
  const categories = data?.data ?? [];
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  if (isPending) {
    return (
      <div className="flex flex-col gap-1 px-3 py-1" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p role="alert" className="px-3 py-2 text-sm text-destructive">
        {dict.catalog.categoriesError}
      </p>
    );
  }

  if (categories.length === 0) {
    return null;
  }

  return (
    <>
      <hr className="my-1 border-border" />
      <p className="px-3 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {dict.header.catalogButton}
      </p>
      {categories.map((category) => {
        const hasChildren = category.children.length > 0;
        const isOpen = Boolean(openIds[category.id]);
        return (
          <div key={category.id}>
            <div className="flex items-center">
              <Link
                href={`/categories/${category.slug}`}
                onClick={onNavigate}
                className={`${MOBILE_LINK_CLASS} flex-1`}
              >
                {category.name}
              </Link>
              {hasChildren && (
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`mobile-subcats-${category.id}`}
                  aria-label={dict.header.toggleSubcategoriesAria(
                    category.name,
                  )}
                  onClick={() =>
                    setOpenIds((prev) => ({
                      ...prev,
                      [category.id]: !prev[category.id],
                    }))
                  }
                  className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronDown
                    className={cn(
                      "size-4 transition-transform",
                      isOpen && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                </button>
              )}
            </div>
            {hasChildren && isOpen && (
              <ul
                id={`mobile-subcats-${category.id}`}
                className="ml-3 flex flex-col gap-0.5 border-l border-border py-1 pl-3"
              >
                {category.children.map((child) => (
                  <li key={child.id}>
                    <Link
                      href={`/categories/${child.slug}`}
                      onClick={onNavigate}
                      className={MOBILE_LINK_CLASS}
                    >
                      {child.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </>
  );
}
