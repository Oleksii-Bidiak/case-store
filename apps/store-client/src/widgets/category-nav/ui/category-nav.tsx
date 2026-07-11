"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import {
  Smartphone,
  Zap,
  Cable,
  ShieldCheck,
  Headphones,
  Package,
  ChevronRight,
} from "lucide-react";
import { useCategoryControllerGetRootCategories } from "@/entities/category";
import { dict } from "@/shared/config";
import { CategoryNavSkeleton } from "./category-nav-skeleton";

// Map a category to an icon + accent by matching keywords in its slug/name, so
// tiles look intentional even though categories carry no image of their own.
const CATEGORY_STYLES: {
  match: RegExp;
  icon: ComponentType<{ className?: string }>;
  tile: string;
}[] = [
  { match: /case|чох/i, icon: Smartphone, tile: "bg-primary/12 text-primary" },
  { match: /charg|заряд/i, icon: Zap, tile: "bg-warning/12 text-warning" },
  { match: /cable|кабел/i, icon: Cable, tile: "bg-success/12 text-success" },
  {
    match: /screen|protect|скло|захис/i,
    icon: ShieldCheck,
    tile: "bg-sky-500/12 text-sky-500",
  },
  {
    match: /audio|headph|навуш|аудіо/i,
    icon: Headphones,
    tile: "bg-violet-500/12 text-violet-500",
  },
];

function styleFor(category: { slug: string; name: string }) {
  const haystack = `${category.slug} ${category.name}`;
  return (
    CATEGORY_STYLES.find((s) => s.match.test(haystack)) ?? {
      icon: Package,
      tile: "bg-muted text-muted-foreground",
    }
  );
}

/**
 * CategoryNav — the homepage "Категорії" showcase section. Renders root category
 * tiles from the real API, each linking to its filtered listing. Owns its own
 * heading, "view all" link and loading/error/empty states.
 * Client Component: consumes the Orval-generated TanStack Query hook.
 */
export function CategoryNav() {
  const { data, isPending, isError } = useCategoryControllerGetRootCategories({
    isActive: true,
    sortBy: "sortOrder",
    sortOrder: "asc",
  });

  const categories = data?.data ?? [];

  return (
    <section
      aria-labelledby="categories-heading"
      className="mx-auto w-full max-w-7xl px-4"
    >
      <div className="mb-6 flex items-baseline justify-between">
        <h2
          id="categories-heading"
          className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
        >
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
            {categories.map((category) => {
              const { icon: Icon, tile } = styleFor(category);
              return (
                <li key={category.id}>
                  <Link
                    href={`/categories/${category.slug}`}
                    className="group flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5 transition-all duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className={`inline-flex size-12 items-center justify-center rounded-xl ${tile}`}
                      aria-hidden="true"
                    >
                      <Icon className="size-6 transition-transform duration-200 group-hover:scale-110" />
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
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </section>
  );
}
