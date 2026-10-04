"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminCarouselControllerFindAllQueryKey,
  getAdminCarouselControllerGetItemsQueryOptions,
  useAdminCarouselControllerCreate,
  useAdminCarouselControllerSetItems,
  type CarouselEntity,
  type CreateCarouselDto,
} from "@/shared/api";
import { dict } from "@/shared/config";

/**
 * The create payload of a carousel's copy («Дублювати», TASK-1074): the same
 * source, category, count and place, a «(копія)» title, and ALWAYS a draft —
 * two identical rails must never go up side by side. The API appends the copy
 * to the end of its placement.
 */
export function duplicateCarouselPayload(
  carousel: CarouselEntity,
): CreateCarouselDto {
  return {
    title: dict.carousels.duplicateTitle(carousel.title),
    source: carousel.source,
    placement: carousel.placement,
    categoryId:
      carousel.source === "CATEGORY" && carousel.categoryId
        ? carousel.categoryId
        : undefined,
    itemLimit: carousel.itemLimit,
    status: "DRAFT",
  };
}

/**
 * «Дублювати» end to end on the EXISTING API: create the copy, then — for a
 * «Вибрані вручну» carousel — give it the same hand-picked list in the same
 * order (`PUT /admin/carousels/:id/items`). Resolves with the copy's id.
 */
export function useDuplicateCarousel() {
  const queryClient = useQueryClient();
  const create = useAdminCarouselControllerCreate();
  const setItems = useAdminCarouselControllerSetItems();

  const duplicate = async (carousel: CarouselEntity): Promise<string> => {
    const created = await create.mutateAsync({
      data: duplicateCarouselPayload(carousel),
    });
    const copyId = created.data.id;
    if (carousel.source === "MANUAL") {
      const items = await queryClient.fetchQuery(
        getAdminCarouselControllerGetItemsQueryOptions(carousel.id),
      );
      const list = items.data ?? [];
      if (list.length > 0) {
        await setItems.mutateAsync({
          id: copyId,
          data: {
            items: list.map((item, index) => ({
              productId: item.productId,
              sortOrder: index,
            })),
          },
        });
      }
    }
    await queryClient.invalidateQueries({
      queryKey: getAdminCarouselControllerFindAllQueryKey(),
    });
    return copyId;
  };

  return {
    duplicate,
    isPending: create.isPending || setItems.isPending,
  };
}
