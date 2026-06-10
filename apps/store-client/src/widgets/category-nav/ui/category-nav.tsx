"use client";

import Link from "next/link";
import { useCategoryControllerGetRootCategories } from "@/entities/category";
import { CategoryNavSkeleton } from "./category-nav-skeleton";

/**
 * CategoryNav — renders root category tiles for homepage navigation.
 * Client Component: consumes the Orval-generated TanStack Query hook.
 */
export function CategoryNav() {
  const { data, isPending, isError } = useCategoryControllerGetRootCategories({
    isActive: true,
    sortBy: "sortOrder",
    sortOrder: "asc",
  });

  if (isPending) {
    return <CategoryNavSkeleton />;
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Failed to load categories. Please try again later.
      </p>
    );
  }

  const categories = data?.data ?? [];

  if (categories.length === 0) {
    return <p className="text-sm text-muted-foreground">No categories yet.</p>;
  }

  return (
    <nav aria-label="Product categories">
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {categories.map((category) => (
          <li key={category.id}>
            <Link
              href={`/products?categoryId=${category.id}`}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className="aspect-video w-full rounded-md bg-muted"
                aria-hidden="true"
              />
              <span className="text-sm font-medium text-card-foreground">
                {category.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
