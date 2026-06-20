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
  ArrowUpRight,
} from "lucide-react";
import { useCategoryControllerGetRootCategories } from "@/entities/category";
import { dict } from "@/shared/config";
import { CategoryNavSkeleton } from "./category-nav-skeleton";

// Map a category to an icon + gradient by matching keywords in its slug/name,
// so tiles look intentional even though categories carry no image yet.
const CATEGORY_STYLES: {
  match: RegExp;
  icon: ComponentType<{ className?: string }>;
  gradient: string;
}[] = [
  {
    match: /case|чох/i,
    icon: Smartphone,
    gradient: "from-indigo-500 to-violet-600",
  },
  {
    match: /charg|заряд/i,
    icon: Zap,
    gradient: "from-amber-500 to-orange-600",
  },
  {
    match: /cable|кабел/i,
    icon: Cable,
    gradient: "from-emerald-500 to-teal-600",
  },
  {
    match: /screen|protect|скло|захис/i,
    icon: ShieldCheck,
    gradient: "from-sky-500 to-blue-600",
  },
  {
    match: /audio|headph|навуш|аудіо/i,
    icon: Headphones,
    gradient: "from-rose-500 to-pink-600",
  },
];

function styleFor(category: { slug: string; name: string }) {
  const haystack = `${category.slug} ${category.name}`;
  return (
    CATEGORY_STYLES.find((s) => s.match.test(haystack)) ?? {
      icon: Package,
      gradient: "from-slate-500 to-slate-700",
    }
  );
}

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
        {dict.catalog.categoriesError}
      </p>
    );
  }

  const categories = data?.data ?? [];

  if (categories.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {dict.catalog.noCategories}
      </p>
    );
  }

  return (
    <nav aria-label={dict.catalog.categoriesAria}>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {categories.map((category) => {
          const { icon: Icon, gradient } = styleFor(category);
          return (
            <li key={category.id}>
              <Link
                href={`/products?categoryId=${category.id}`}
                className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[var(--shadow-lift)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={`relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br text-white ${gradient}`}
                  aria-hidden="true"
                >
                  <Icon className="size-9 opacity-90 transition-transform duration-200 group-hover:scale-110" />
                  <span className="absolute inset-0 opacity-[0.12] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:14px_14px]" />
                </span>
                <span className="flex items-center justify-between text-sm font-semibold text-card-foreground">
                  {category.name}
                  <ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
