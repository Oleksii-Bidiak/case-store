"use client";

import { useMemo } from "react";
import type { CarouselEntity } from "@/entities/carousel";
import {
  flattenAdminCategoryTree,
  useCategoryControllerGetAdminTree,
} from "@/entities/category";
import type { CarouselPickedItem } from "@/features/carousel-item-picker";
import {
  Badge,
  ReadOnlyField,
  ReadOnlyLayout,
  ReadOnlyNotice,
  ReadOnlySection,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatDateTime } from "@/shared/lib";
import { AutoSourcePanel } from "./carousel-source-panels";

const f = dict.carouselForm;
const c = dict.carouselItems;
const rv = dict.readOnlyView;

/**
 * The carousel without `carousels:write` (TASK-667 template): the form's
 * «Основне · Звідки товари · Публікація» as text, then the products — the
 * saved hand-picked list in order, or what the automatic source shows on the
 * site now. No «Дублювати», no «Видалити», no save bar.
 */
export function CarouselReadOnly({
  carousel,
  items,
  itemsLoading,
}: {
  carousel: CarouselEntity;
  /** The saved hand-picked list (MANUAL), in its order. */
  items: readonly CarouselPickedItem[];
  itemsLoading: boolean;
}) {
  // The category's name from the admin tree — readable with `categories:read`;
  // without it the source still reads «Категорія».
  const tree = useCategoryControllerGetAdminTree({
    query: { enabled: carousel.source === "CATEGORY" },
  });
  const categoryName = useMemo(
    () =>
      flattenAdminCategoryTree(tree.data?.data).find(
        (item) => item.id === carousel.categoryId,
      )?.label,
    [tree.data, carousel.categoryId],
  );

  return (
    <div className="flex flex-col gap-4">
      <ReadOnlyNotice>{rv.notices.carousels}</ReadOnlyNotice>
      <ReadOnlyLayout>
        <ReadOnlySection title={f.sectionMain}>
          <ReadOnlyField label={f.title}>{carousel.title}</ReadOnlyField>
        </ReadOnlySection>

        <ReadOnlySection title={f.source}>
          <ReadOnlyField label={f.source}>
            {f.sourceOptions[carousel.source]}
          </ReadOnlyField>
          {carousel.source === "CATEGORY" ? (
            <ReadOnlyField label={f.category}>
              {categoryName ?? dict.carousels.sourceLabels.CATEGORY}
            </ReadOnlyField>
          ) : null}
          <ReadOnlyField label={f.itemLimit}>
            {carousel.itemLimit}
          </ReadOnlyField>
        </ReadOnlySection>

        {carousel.source === "MANUAL" ? (
          <ReadOnlySection title={c.heading}>
            <ReadOnlyField
              label={c.heading}
              empty={!itemsLoading && items.length === 0}
            >
              {itemsLoading ? (
                <span className="text-muted-foreground">
                  {dict.common.loading}
                </span>
              ) : (
                <ol className="flex list-decimal flex-col gap-1 pl-5">
                  {items.map((item) => (
                    <li key={item.productId}>
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {item.name}
                        {item.isActive ? null : (
                          <Badge variant="secondary">{c.inactiveBadge}</Badge>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </ReadOnlyField>
          </ReadOnlySection>
        ) : (
          <AutoSourcePanel source={carousel.source} saved={carousel} />
        )}

        <ReadOnlySection title={f.status}>
          <ReadOnlyField label={f.status}>
            {dict.carousels.statusLabels[carousel.status]}
          </ReadOnlyField>
          {carousel.status === "SCHEDULED" ? (
            <ReadOnlyField label={f.scheduledAt}>
              {carousel.scheduledAt
                ? formatDateTime(carousel.scheduledAt)
                : null}
            </ReadOnlyField>
          ) : null}
        </ReadOnlySection>
      </ReadOnlyLayout>
    </div>
  );
}
