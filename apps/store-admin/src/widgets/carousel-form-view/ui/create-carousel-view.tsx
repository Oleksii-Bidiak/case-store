"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  CarouselForm,
  carouselFormValuesToCreateDto,
  type CarouselFormValues,
} from "@/features/carousel-form";
import type { CarouselPickedItem } from "@/features/carousel-item-picker";
import {
  getAdminCarouselControllerFindAllQueryKey,
  useAdminCarouselControllerCreate,
  useAdminCarouselControllerSetItems,
} from "@/entities/carousel";
import { dict } from "@/shared/config";
import {
  AutoSourcePanel,
  ManualItemsPanel,
  itemsPayload,
} from "./carousel-source-panels";

/**
 * Create-carousel body (CarouselsProposal КР8): the form, and — for
 * «Вибрані вручну» — the item list right away, built before the carousel
 * exists. «Створити карусель» creates it, then writes the list to the new id
 * (`PUT /admin/carousels/:id/items`); the list is only a draft until then.
 */
export function CreateCarouselView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useAdminCarouselControllerCreate();
  const setItems = useAdminCarouselControllerSetItems();
  const [items, setItemsDraft] = useState<CarouselPickedItem[]>([]);

  const handleSubmit = async (values: CarouselFormValues) => {
    let createdId: string;
    try {
      const created = await create.mutateAsync({
        data: carouselFormValuesToCreateDto(values),
      });
      createdId = created.data.id;
    } catch {
      toast.error(dict.carousels.toastCreateFailed);
      return;
    }

    if (values.source === "MANUAL" && items.length > 0) {
      try {
        await setItems.mutateAsync({
          id: createdId,
          data: itemsPayload(items),
        });
      } catch {
        toast.error(dict.carousels.toastItemsFailed);
      }
    }

    void queryClient.invalidateQueries({
      queryKey: getAdminCarouselControllerFindAllQueryKey(),
    });
    toast.success(dict.carousels.toastCreated);
    router.push("/carousels");
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/carousels"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.carousels.back}
        </Link>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.carousels.createHeading}
        </h2>
      </div>

      <CarouselForm
        onSubmit={handleSubmit}
        isPending={create.isPending || setItems.isPending}
        submitLabel={dict.carousels.createSubmit}
        extraDirtySections={
          items.length > 0 ? [dict.carouselItems.heading] : []
        }
        onDiscardExtra={() => setItemsDraft([])}
        renderItemsSection={(source) =>
          source === "MANUAL" ? (
            <ManualItemsPanel items={items} onChange={setItemsDraft} />
          ) : (
            <AutoSourcePanel source={source} />
          )
        }
      />
    </div>
  );
}
