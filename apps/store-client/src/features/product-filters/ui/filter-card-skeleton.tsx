import { Skeleton } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import type { FilterSectionId } from "../model/filter-sections";

/**
 * Placeholder height per filter card, measured on the live rail at 1440px
 * (2026-10-03, seeded catalogue): keyword 94, availability 108.5, sale 108.5,
 * brand 112.5, device 158.5, price 164.5 px. The spacing scale has no
 * half-pixel steps, so availability and sale round opposite ways and the
 * running error down the rail never exceeds half a pixel — no card visibly
 * moves when the real one replaces its box. «Характеристики» depends on the
 * category's facet list (543–763px on the seed); `h-140` is the typical value,
 * and the card is the rail's last, so a mismatch shifts nothing under it.
 */
const FILTER_CARD_HEIGHT: Record<FilterSectionId, string> = {
  search: "h-23.5",
  availability: "h-27",
  onSale: "h-27.25",
  brand: "h-28",
  device: "h-39.75",
  price: "h-41.25",
  specs: "h-140",
};

interface FilterCardSkeletonProps {
  section: FilterSectionId;
  className?: string;
}

/**
 * One filter card's placeholder — the box a rail section occupies before its
 * content is there (TASK-515).
 *
 * Drawn twice, deliberately from this one component: by the catalogue
 * skeleton for every section, and by «Виробник» / «Характеристики»
 * themselves while their request is in flight. Those two cards wait on data
 * the server does not hand over, so for the first second after the skeleton
 * is swapped the real rail used to be one or two cards short — the device and
 * price cards jumped up by the brand card's height and then fell back down.
 * Holding the same box until the data decides keeps the rail still.
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
        FILTER_CARD_HEIGHT[section],
        className,
      )}
    />
  );
}
