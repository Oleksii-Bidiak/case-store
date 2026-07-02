"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  useCategoryControllerGetCategoryTree,
  type CategoryTreeNodeEntity,
} from "@/entities/category";
import { dict } from "@/shared/config";
import { Skeleton } from "@/shared/ui";
import { categoryGradient, pickCategoryIcon } from "../model/category-visuals";

const activeOnly = (nodes: CategoryTreeNodeEntity[]) =>
  nodes.filter((n) => n.isActive).sort((a, b) => a.sortOrder - b.sortOrder);

/**
 * CategoriesView — the `/categories` hub (Categories.dc.html redesign). Real
 * data: the public category tree (`GET /api/categories/tree`) drives the rail
 * (root categories) and the tiles (their children); each tile links to the
 * filtered catalog. Product counts are omitted (categories carry none) and the
 * "популярні бренди" strip is a stub (no brand model yet — TASK-176).
 */
export function CategoriesView() {
  const { data, isPending, isError } = useCategoryControllerGetCategoryTree();
  const [groupId, setGroupId] = useState<string | null>(null);

  if (isPending) {
    return (
      <div className="grid gap-7 lg:grid-cols-[264px_1fr] lg:items-start">
        <Skeleton className="hidden h-80 rounded-[18px] lg:block" />
        <div>
          <Skeleton className="mb-6 h-10 w-64" />
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(196px,1fr))]">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-[220px] rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.categories.loadError}
      </p>
    );
  }

  const roots = activeOnly(data?.data ?? []);

  if (roots.length === 0) {
    return (
      <p className="text-muted-foreground">{dict.categories.emptyHeading}</p>
    );
  }

  const activeRoot = roots.find((r) => r.id === groupId) ?? roots[0];
  const children = activeOnly(activeRoot.children);

  return (
    <div className="grid gap-7 lg:grid-cols-[264px_1fr] lg:items-start">
      {/* Rail — root categories */}
      <aside className="rounded-[18px] border border-border bg-card p-2 shadow-[var(--shadow-card)] lg:sticky lg:top-4">
        <nav aria-label={dict.categories.navAria} className="flex flex-col">
          {roots.map((root) => {
            const Icon = pickCategoryIcon(root.name, root.slug);
            const active = root.id === activeRoot.id;
            return (
              <button
                key={root.id}
                type="button"
                onClick={() => setGroupId(root.id)}
                aria-current={active ? "true" : undefined}
                className={`relative mb-0.5 flex w-full items-center gap-3 rounded-[11px] px-3.5 py-[11px] text-left text-[14.5px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active
                    ? "font-semibold text-primary"
                    : "font-medium text-foreground hover:bg-muted"
                }`}
                style={
                  active
                    ? {
                        background:
                          "color-mix(in oklab, var(--color-primary) 10%, var(--color-card))",
                      }
                    : undefined
                }
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute top-[9px] bottom-[9px] left-0 w-[3px] rounded-full bg-primary"
                  />
                )}
                <Icon
                  className={`size-5 ${active ? "text-primary" : "text-muted-foreground"}`}
                  aria-hidden="true"
                />
                <span className="flex-1">{root.name}</span>
                {!active && (
                  <ChevronRight
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Content — selected group */}
      <section className="min-w-0">
        <nav
          aria-label={dict.product.breadcrumbAria}
          className="mb-3.5 flex flex-wrap items-center gap-[9px] text-[13.5px] text-muted-foreground"
        >
          <Link href="/" className="transition-colors hover:text-foreground">
            {dict.categories.breadcrumbHome}
          </Link>
          <span aria-hidden="true" className="opacity-50">
            ›
          </span>
          <span className="font-medium text-foreground">{activeRoot.name}</span>
        </nav>

        <h1 className="font-display text-[32px] font-bold tracking-[-0.02em] text-foreground">
          {activeRoot.name}
        </h1>
        <p className="mt-1.5 mb-6 max-w-[680px] text-[14.5px] leading-[1.5] text-muted-foreground">
          {activeRoot.description ?? dict.categories.descFallback}
        </p>

        {children.length > 0 ? (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(196px,1fr))]">
            {children.map((child, index) => {
              const Icon = pickCategoryIcon(child.name, child.slug);
              return (
                <Link
                  key={child.id}
                  href={`/products?categoryId=${child.id}`}
                  className="flex flex-col rounded-2xl border border-border bg-card p-[18px] no-underline shadow-[var(--shadow-card)] transition-[transform,box-shadow] hover:-translate-y-[3px] hover:shadow-[var(--shadow-lift)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div
                    className="mb-3.5 flex aspect-square items-center justify-center rounded-[13px]"
                    style={{ background: categoryGradient(index) }}
                  >
                    <Icon className="size-10 text-white" aria-hidden="true" />
                  </div>
                  <b className="text-[15px] leading-[1.3] font-semibold text-pretty text-foreground">
                    {child.name}
                  </b>
                </Link>
              );
            })}
          </div>
        ) : (
          <Link
            href={`/products?categoryId=${activeRoot.id}`}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground no-underline transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {dict.categories.viewAllInCategory}
          </Link>
        )}

        {/* Popular brands — stub (no brand model yet). */}
        <h2 className="mt-[38px] mb-4 font-display text-[20px] font-bold tracking-[-0.01em] text-foreground">
          {dict.categories.brandsHeading}
        </h2>
        <div className="flex flex-wrap gap-3">
          {dict.categories.brands.map((brand) => (
            <Link
              key={brand}
              href="/products"
              className="inline-flex h-14 min-w-[118px] items-center justify-center rounded-xl border border-border bg-card px-[22px] font-display text-base font-bold text-foreground no-underline shadow-[var(--shadow-card)] transition-colors hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {brand}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
