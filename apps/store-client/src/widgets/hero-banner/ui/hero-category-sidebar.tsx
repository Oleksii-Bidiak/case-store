"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useCategoryControllerGetRootCategories } from "@/entities/category";
import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

// Small palette cycled across the category dots so the rail looks intentional
// even though categories carry no colour of their own.
const DOT_COLORS = [
  "text-primary",
  "text-violet-500",
  "text-sky-500",
  "text-warning",
  "text-success",
  "text-sale",
  "text-pink-500",
  "text-emerald-500",
] as const;

/**
 * HeroCategorySidebar — the left rail beside the hero slider. Lists root
 * categories from the real API and links each to its filtered listing. Hidden
 * below `lg` (the header already exposes catalog navigation on mobile).
 * Client Component: consumes the Orval-generated TanStack Query hook.
 */
export function HeroCategorySidebar() {
  const { data, isPending, isError } = useCategoryControllerGetRootCategories({
    isActive: true,
    sortBy: "sortOrder",
    sortOrder: "asc",
  });

  return (
    <aside
      aria-label={dict.home.hero.sidebarAria}
      className="hidden rounded-2xl border border-border bg-card p-2 shadow-[var(--shadow-card)] lg:block"
    >
      {isPending && (
        <div className="flex flex-col gap-1 p-1" aria-hidden="true">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      )}

      {isError && (
        <p role="alert" className="px-3 py-2 text-sm text-destructive">
          {dict.catalog.categoriesError}
        </p>
      )}

      {!isPending && !isError && (
        <nav>
          <ul>
            {(data?.data ?? []).map((category, i) => (
              <li key={category.id}>
                <Link
                  href={`/products?categoryId=${category.id}`}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    aria-hidden="true"
                    className={DOT_COLORS[i % DOT_COLORS.length]}
                  >
                    ●
                  </span>
                  <span className="truncate">{category.name}</span>
                </Link>
              </li>
            ))}
            {(data?.data ?? []).length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                {dict.catalog.noCategories}
              </li>
            )}
            <li>
              <Link
                href="/categories"
                className="mt-0.5 flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {dict.home.hero.allCategories}
                <ChevronRight className="size-4" />
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </aside>
  );
}
