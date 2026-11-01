import { Skeleton } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import type { FilterSectionId } from "../model/filter-sections";

/**
 * Placeholder height of a rail card — the panels that stand on their own:
 * «З урахуванням моїх пристроїв» and, while its facet list is in flight
 * outside the panel, «Характеристики» (543–763px on the seed; `h-140` is the
 * typical value).
 */
const FILTER_CARD_HEIGHT: Partial<Record<FilterSectionId, string>> = {
  myDevices: "h-41",
  specs: "h-140",
};

/**
 * Placeholder height of each section's BODY inside the «Фільтри товарів»
 * panel (Д3-2 Catalog §12), under its 16px title bar: one checkbox row (32),
 * the price inputs + slider + bound labels (≈ 120), five brand rows and «Ще N»
 * (≈ 190), the brand → model cascade (≈ 130), the category's facets. A new
 * section without a height fails typecheck. «Зі знижкою» has no body of its
 * own — it is a row inside the price section.
 */
const FILTER_SECTION_BODY_HEIGHT: Record<
  Exclude<FilterSectionId, "myDevices" | "onSale">,
  string
> = {
  availability: "h-8",
  price: "h-30",
  brand: "h-48",
  device: "h-32",
  specs: "h-124",
};

interface FilterCardSkeletonProps {
  section: FilterSectionId;
  className?: string;
}

/**
 * One rail card's placeholder — the box a stand-alone panel occupies before
 * its content is there (TASK-515): «Мої пристрої» until the saved devices are
 * read, «Характеристики» until its facets land.
 */
export function FilterCardSkeleton({
  section,
  className,
}: FilterCardSkeletonProps) {
  return (
    <Skeleton
      aria-hidden="true"
      data-section={section}
      className={cn(
        "w-full rounded-2xl",
        FILTER_CARD_HEIGHT[section] ?? "h-28",
        className,
      )}
    />
  );
}

/**
 * The «Фільтри товарів» panel's placeholder: the panel's own shell with one
 * block per section, hairlines and paddings as the real one — so the rail
 * keeps its shape when the catalogue skeleton is swapped for the page.
 * `sections` is `filterRailSections(…)`, the list the panel gates on.
 */
export function FilterPanelSkeleton({
  sections,
}: {
  sections: readonly FilterSectionId[];
}) {
  const inPanel = sections.filter(
    (section): section is keyof typeof FILTER_SECTION_BODY_HEIGHT =>
      section !== "myDevices" && section !== "onSale",
  );
  const withSale = sections.includes("onSale");
  return (
    <div
      aria-hidden="true"
      data-testid="filter-panel-skeleton"
      className="rounded-2xl border border-border bg-card px-3.5 py-2 shadow-card"
    >
      {inPanel.map((section) => (
        <div
          key={section}
          data-section={section}
          className="border-t border-border px-1.5 py-3.5 first:border-t-0 first:pt-2 last:pb-2"
        >
          <Skeleton className="mb-2 h-4 w-24" />
          <Skeleton
            className={cn(
              "w-full rounded-menu",
              FILTER_SECTION_BODY_HEIGHT[section],
            )}
          />
          {section === "price" && withSale && (
            <Skeleton className="mt-3 h-8 w-full rounded-menu" />
          )}
        </div>
      ))}
    </div>
  );
}
