"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  useCategoryControllerGetCategoryTree,
  type CategoryTreeNodeEntity,
} from "@/entities/category";
import { useBrandControllerFindAll } from "@/entities/brand";
import {
  dict,
  SITE_URL,
  STICKY_ASIDE_TOP,
  H1_CLASS,
  H2_CLASS,
} from "@/shared/config";
import { buildBreadcrumbSchema } from "@/shared/lib/schema";
import { cn } from "@/shared/lib/utils";
import { CategoryTileImage, JsonLd, Skeleton } from "@/shared/ui";
import { categoryGradient, pickCategoryIcon } from "../model/category-visuals";

const activeOnly = (nodes: CategoryTreeNodeEntity[]) =>
  nodes.filter((n) => n.isActive).sort((a, b) => a.sortOrder - b.sortOrder);

/**
 * Child tiles: two columns on a phone (TASK-877 — one 358 px tile per row made
 * three subcategories a full screen of scrolling), the fluid 196 px auto-fill
 * from md where the content column is wide enough for it.
 */
const TILE_GRID = `grid grid-cols-2 gap-4 md:gap-6 md:[grid-template-columns:repeat(auto-fill,minmax(196px,1fr))]`;

/**
 * Root-category list — ONE set of buttons styled per breakpoint (TASK-877):
 * below lg a horizontally scrolling row of pills above the crumbs (active =
 * solid primary), from lg the sticky card rail. A second, CSS-hidden copy would
 * put every root in the DOM twice for assistive tech and tests.
 */
const ROOT_ITEM =
  "relative inline-flex h-11 shrink-0 items-center gap-3 whitespace-nowrap rounded-full border-[1.5px] px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:mb-0.5 lg:h-auto lg:w-full lg:whitespace-normal lg:rounded-menu lg:border-0 lg:px-3.5 lg:py-[11px] lg:text-left";
const ROOT_ITEM_ACTIVE =
  "border-primary bg-primary text-primary-foreground lg:bg-primary/10 lg:text-primary";
const ROOT_ITEM_IDLE =
  "border-border bg-card text-foreground hover:border-primary/40 lg:bg-transparent lg:font-medium lg:hover:bg-muted";

/**
 * CategoriesView — the `/categories` hub (Categories.dc.html redesign). Real
 * data: the public category tree (`GET /api/categories/tree`) drives the rail
 * (root categories) and the tiles (their children); each tile links to the
 * filtered catalog. Product counts are omitted (categories carry none) and the
 * "популярні бренди" strip is wired to the real `Brand` model (TASK-189).
 */
export function CategoriesView() {
  const { data, isPending, isError } = useCategoryControllerGetCategoryTree();
  const { data: brandsData } = useBrandControllerFindAll();
  const brands = brandsData?.data ?? [];
  const [groupId, setGroupId] = useState<string | null>(null);

  if (isPending) {
    return (
      // eslint-disable-next-line tailwindcss/no-arbitrary-value -- fixed+fluid column layout has no named grid-cols-N equivalent
      <div className="grid gap-4 lg:grid-cols-[264px_1fr] lg:items-start lg:gap-7">
        <div className="flex gap-2 overflow-hidden lg:hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-28 shrink-0 rounded-full" />
          ))}
        </div>
        <Skeleton className="hidden h-80 rounded-card lg:block" />
        <div>
          <Skeleton className="mb-6 h-10 w-64" />
          <div className={TILE_GRID}>
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton
                key={i}
                className="aspect-square rounded-card md:aspect-auto md:h-[220px]"
              />
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

  // The visible trail and the BreadcrumbList are built from this one array
  // (TASK-877): the server-rendered schema used to say «Категорії» while the
  // page showed the selected root. The last crumb is the current page, which
  // is this hub — the root has no URL of its own here.
  const crumbs = [
    { name: dict.categories.breadcrumbHome, href: "/" },
    { name: activeRoot.name, href: "/categories" },
  ];

  return (
    // eslint-disable-next-line tailwindcss/no-arbitrary-value -- fixed+fluid column layout has no named grid-cols-N equivalent
    <div className="grid gap-4 lg:grid-cols-[264px_1fr] lg:items-start lg:gap-7">
      <JsonLd
        schema={buildBreadcrumbSchema(
          crumbs.map((c) => ({
            name: c.name,
            item: c.href === "/" ? SITE_URL : `${SITE_URL}${c.href}`,
          })),
        )}
      />

      {/* Root categories — chips below lg, card rail from lg */}
      <aside
        className={`min-w-0 lg:sticky ${STICKY_ASIDE_TOP} lg:rounded-card lg:border lg:border-border lg:bg-card lg:p-2 lg:shadow-card`}
      >
        <nav
          aria-label={dict.categories.navAria}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-col lg:gap-0 lg:overflow-visible lg:px-0 lg:pb-0"
        >
          {roots.map((root) => {
            const Icon = pickCategoryIcon(root.name, root.slug);
            const active = root.id === activeRoot.id;
            return (
              <button
                key={root.id}
                type="button"
                onClick={(event) => {
                  setGroupId(root.id);
                  // A chip half-clipped at the row's edge is brought fully in
                  // (no-op on the rail, where every item is already visible).
                  event.currentTarget.scrollIntoView?.({
                    block: "nearest",
                    inline: "nearest",
                  });
                }}
                aria-current={active ? "true" : undefined}
                className={cn(
                  ROOT_ITEM,
                  active ? ROOT_ITEM_ACTIVE : ROOT_ITEM_IDLE,
                )}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute top-[9px] bottom-[9px] left-0 hidden w-[3px] rounded-full bg-primary lg:block"
                  />
                )}
                <Icon
                  className={`hidden size-5 shrink-0 lg:block ${active ? "text-primary" : "text-muted-foreground"}`}
                  aria-hidden="true"
                />
                <span className="lg:flex-1">{root.name}</span>
                {!active && (
                  <ChevronRight
                    className="hidden size-4 shrink-0 text-muted-foreground lg:block"
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
          className="mb-3.5 flex flex-wrap items-center gap-[9px] text-sm text-muted-foreground"
        >
          <Link
            href={crumbs[0].href}
            className="transition-colors hover:text-foreground"
          >
            {crumbs[0].name}
          </Link>
          <span aria-hidden="true" className="opacity-50">
            ›
          </span>
          <span aria-current="page" className="font-medium text-foreground">
            {crumbs[1].name}
          </span>
        </nav>

        <h1 className={`${H1_CLASS} text-foreground`}>{activeRoot.name}</h1>
        <p className="mt-1.5 mb-4 max-w-[680px] text-sm leading-[1.5] text-muted-foreground md:mb-6">
          {activeRoot.description ?? dict.categories.descFallback}
        </p>

        {children.length > 0 ? (
          <div className={TILE_GRID}>
            {children.map((child, index) => {
              const Icon = pickCategoryIcon(child.name, child.slug);
              return (
                <Link
                  key={child.id}
                  href={`/categories/${child.slug}`}
                  className="flex flex-col rounded-card border border-border bg-card p-3 no-underline shadow-card transition-[transform,box-shadow] hover:-translate-y-[3px] hover:shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0 md:p-[18px]"
                >
                  <div className="relative mb-3 aspect-square overflow-hidden rounded-cta md:mb-3.5">
                    <CategoryTileImage
                      src={child.image}
                      alt=""
                      className="size-full object-cover"
                      fallback={
                        <div
                          className="flex size-full items-center justify-center"
                          style={{ background: categoryGradient(index) }}
                        >
                          <Icon
                            className="size-8 text-white md:size-10"
                            aria-hidden="true"
                          />
                        </div>
                      }
                    />
                  </div>
                  <b className="text-sm leading-snug font-semibold text-pretty text-foreground md:text-base">
                    {child.name}
                  </b>
                </Link>
              );
            })}
          </div>
        ) : (
          <Link
            href={`/categories/${activeRoot.slug}`}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground no-underline transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {dict.categories.viewAllInCategory}
          </Link>
        )}

        {/* Popular brands — real Brand data (TASK-189). Hidden when empty, same
            convention as the CategoryChips empty guard. Each tile links to the
            brand-filtered catalog. */}
        {brands.length > 0 && (
          <>
            <h2 className={`mt-10 mb-4 ${H2_CLASS} text-foreground`}>
              {dict.categories.brandsHeading}
            </h2>
            <div className="flex flex-wrap gap-3">
              {brands.map((brand) => (
                <Link
                  key={brand.id}
                  href={`/products?brand=${encodeURIComponent(brand.slug)}`}
                  className="inline-flex h-14 min-w-[118px] items-center justify-center rounded-xl border border-border bg-card px-[22px] font-display text-base font-bold text-foreground no-underline shadow-card transition-colors hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {brand.name}
                </Link>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
