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

/** `CreateCarouselDto.title` — `@MaxLength(255)` in the API. */
const CAROUSEL_TITLE_MAX = 255;

/**
 * The copy WAS created, but its hand-picked list was not copied. The caller
 * must say so — «не вдалося» would invite a second click and a second copy.
 */
export class DuplicateCarouselItemsError extends Error {
  constructor(readonly copyId: string) {
    super("Carousel copy created without its items");
    this.name = "DuplicateCarouselItemsError";
  }
}

/**
 * The create payload of a carousel's copy («Дублювати», TASK-1074): the same
 * source, category, count and place, a «(копія)» title, and ALWAYS a draft —
 * two identical rails must never go up side by side. The API appends the copy
 * to the end of its placement.
 */
export function duplicateCarouselPayload(
  carousel: CarouselEntity,
): CreateCarouselDto {
  // The API caps a title at 255; a long one would turn «(копія)» into a 400.
  const room = CAROUSEL_TITLE_MAX - dict.carousels.duplicateTitle("").length;
  return {
    title: dict.carousels.duplicateTitle(
      carousel.title.slice(0, room).trimEnd(),
    ),
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
 * order (`PUT /admin/carousels/:id/items`). Resolves with the copy's id; a
 * failure after the copy exists rejects with `DuplicateCarouselItemsError`.
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
    const invalidateList = () =>
      queryClient.invalidateQueries({
        queryKey: getAdminCarouselControllerFindAllQueryKey(),
      });
    if (carousel.source === "MANUAL") {
      try {
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
      } catch {
        await invalidateList();
        throw new DuplicateCarouselItemsError(copyId);
      }
    }
    await invalidateList();
    return copyId;
  };

  return {
    duplicate,
    isPending: create.isPending || setItems.isPending,
  };
}
