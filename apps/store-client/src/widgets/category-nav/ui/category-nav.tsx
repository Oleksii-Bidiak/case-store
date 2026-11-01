"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  ACTIVE_ROOT_CATEGORIES_PARAMS,
  useCategoryControllerGetRootCategories,
  type CategoryEntity,
} from "@/entities/category";
import { dict, H2_CLASS, PAGE_CONTAINER } from "@/shared/config";
import { CategoryIcon, CategoryTileImage } from "@/shared/ui";
import { CategoryNavSkeleton } from "./category-nav-skeleton";

/**
 * CategoryTile — one homepage category tile. Shows `Category.image` (admin-set
 * URL, TASK-083) in the 48px slot when present/loadable; otherwise the
 * admin-chosen `Category.icon` from the sprite (TASK-1956) on a neutral pad —
 * categories never take a colour tint (Д3 colour rule), and an icon-less
 * category gets the generic folder.
 */
function CategoryTile({ category }: { category: CategoryEntity }) {
  return (
    <Link
      href={`/categories/${category.slug}`}
      className="group flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5 transition-interactive hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-lift active:translate-y-0 active:scale-99 active:shadow-card motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-solid focus-visible:outline-ring"
    >
      <span
        className="inline-flex size-12 items-center justify-center overflow-hidden rounded-xl"
        aria-hidden="true"
      >
        <CategoryTileImage
          src={category.image}
          alt=""
          className="size-full object-cover"
          fallback={
            <span className="flex size-full items-center justify-center bg-muted text-foreground">
              <CategoryIcon
                icon={category.icon}
                size={22}
                className="transition-transform duration-200 group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              />
            </span>
          }
        />
      </span>
      <span className="font-semibold text-card-foreground">
        {category.name}
      </span>
      {category.description && (
        <span className="line-clamp-1 text-sm text-muted-foreground">
          {category.description}
        </span>
      )}
    </Link>
  );
}

/**
 * CategoryNav — the homepage "Категорії" showcase section. Renders root category
 * tiles from the real API, each linking to its filtered listing. Owns its own
 * heading, "view all" link and loading/error/empty states.
 * Client Component: consumes the Orval-generated TanStack Query hook.
 */
export function CategoryNav() {
  // Shared params: the homepage prefetches this very key (TASK-563).
  const { data, isPending, isError } = useCategoryControllerGetRootCategories(
    ACTIVE_ROOT_CATEGORIES_PARAMS,
  );

  const categories = data?.data ?? [];

  return (
    <section aria-labelledby="categories-heading" className={PAGE_CONTAINER}>
      <div className="mb-6 flex items-baseline justify-between">
        <h2 id="categories-heading" className={`${H2_CLASS} text-foreground`}>
          {dict.home.categories.heading}
        </h2>
        <Link
          href="/categories"
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          {dict.home.categories.viewAll}
          <ChevronRight className="size-4" />
        </Link>
      </div>

      {isPending && <CategoryNavSkeleton />}

      {isError && (
        <p role="alert" className="text-sm text-destructive">
          {dict.catalog.categoriesError}
        </p>
      )}

      {!isPending && !isError && categories.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {dict.catalog.noCategories}
        </p>
      )}

      {!isPending && !isError && categories.length > 0 && (
        <nav aria-label={dict.catalog.categoriesAria}>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {categories.map((category) => (
              <li key={category.id}>
                <CategoryTile category={category} />
              </li>
            ))}
          </ul>
        </nav>
      )}
    </section>
  );
}
