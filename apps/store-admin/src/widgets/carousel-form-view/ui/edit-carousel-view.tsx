"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  CarouselForm,
  carouselFormValuesToUpdateDto,
  type CarouselFormInput,
  type CarouselFormValues,
} from "@/features/carousel-form";
import type { CarouselPickedItem } from "@/features/carousel-item-picker";
import {
  getAdminCarouselControllerFindAllQueryKey,
  getAdminCarouselControllerFindByIdQueryKey,
  getAdminCarouselControllerGetItemsQueryKey,
  useAdminCarouselControllerDelete,
  useAdminCarouselControllerFindById,
  useAdminCarouselControllerGetItems,
  useAdminCarouselControllerSetItems,
  useAdminCarouselControllerUpdate,
  DuplicateCarouselItemsError,
  useDuplicateCarousel,
  type CarouselEntity,
} from "@/entities/carousel";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import { Badge, RowActionsMenu, useConfirmDialog } from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatDate, toKyivDateTimeLocal } from "@/shared/lib";
import { CarouselFormSkeleton } from "./carousel-form-skeleton";
import {
  AutoSourcePanel,
  ManualItemsPanel,
  itemsPayload,
  sameItemOrder,
  toPickedItems,
} from "./carousel-source-panels";

const d = dict.carousels;

interface EditCarouselViewProps {
  carouselId: string;
}

/**
 * Edit-carousel body (CarouselsProposal КР5–КР7): the carousel's own title as
 * the heading with its status and place, «⋯» with «Дублювати» / «Видалити…»,
 * then the form. The item list is part of the form's ONE «Зберегти»: the saved
 * list is read from `GET …/items`, edits live in a draft over it, and saving
 * writes the carousel first and the list right after — only if it changed.
 *
 * The draft is an OVERLAY, not a seeded copy (forms.md): `null` means «the
 * saved list», so a background refetch shows through until the operator
 * touches the list, and «Скасувати зміни» is simply `null` again.
 */
export function EditCarouselView({ carouselId }: EditCarouselViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } =
    useAdminCarouselControllerFindById(carouselId);
  const itemsQuery = useAdminCarouselControllerGetItems(carouselId);
  const update = useAdminCarouselControllerUpdate();
  const setItems = useAdminCarouselControllerSetItems();
  const remove = useAdminCarouselControllerDelete();
  const { duplicate, isPending: isDuplicating } = useDuplicateCarousel();
  const { confirm, confirmDialog } = useConfirmDialog();
  const { can } = useAuth();
  const canWrite = can(PERM.carouselsWrite);

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/carousels");
    }
  }, [isNotFound, router]);

  const carousel = data?.data;
  const savedItems = useMemo(
    () => toPickedItems(itemsQuery.data?.data ?? []),
    [itemsQuery.data],
  );
  const [draftItems, setDraftItems] = useState<CarouselPickedItem[] | null>(
    null,
  );
  const items = draftItems ?? savedItems;
  const itemsDirty =
    draftItems !== null && !sameItemOrder(draftItems, savedItems);

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: getAdminCarouselControllerFindAllQueryKey(),
    });
    void queryClient.invalidateQueries({
      queryKey: getAdminCarouselControllerFindByIdQueryKey(carouselId),
    });
    void queryClient.invalidateQueries({
      queryKey: getAdminCarouselControllerGetItemsQueryKey(carouselId),
    });
  };

  const handleSubmit = async (values: CarouselFormValues) => {
    try {
      await update.mutateAsync({
        id: carouselId,
        data: carouselFormValuesToUpdateDto(values),
      });
    } catch {
      toast.error(d.toastUpdateFailed);
      return;
    }

    if (values.source === "MANUAL" && itemsDirty) {
      try {
        await setItems.mutateAsync({
          id: carouselId,
          data: itemsPayload(items),
        });
      } catch {
        invalidate();
        toast.error(d.toastItemsFailed);
        return;
      }
    }

    invalidate();
    setDraftItems(null);
    toast.success(d.toastUpdated);
    router.push("/carousels");
  };

  const handleDuplicate = async (source: CarouselEntity) => {
    try {
      const copyId = await duplicate(source);
      toast.success(d.toastDuplicated);
      router.push(`/carousels/${copyId}/edit`);
    } catch (error) {
      if (error instanceof DuplicateCarouselItemsError) {
        toast.error(d.toastDuplicateItemsFailed);
        router.push(`/carousels/${error.copyId}/edit`);
        return;
      }
      toast.error(d.toastDuplicateFailed);
    }
  };

  const handleDelete = async (source: CarouselEntity) => {
    const confirmed = await confirm({
      title: d.deleteTitle(source.title),
      description:
        source.placement === "HOME_TABS"
          ? d.deleteDescriptionTab(source.title)
          : d.deleteDescriptionRail(source.title),
      confirmLabel: d.deleteConfirmLabel,
      destructive: true,
    });
    if (!confirmed) return;
    remove.mutate(
      { id: source.id },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminCarouselControllerFindAllQueryKey(),
          });
          toast.success(d.toastDeleted);
          router.push("/carousels");
        },
        onError: () => toast.error(d.toastDeleteFailed),
      },
    );
  };

  if (isLoading) return <CarouselFormSkeleton />;

  const busy =
    update.isPending || setItems.isPending || remove.isPending || isDuplicating;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            href="/carousels"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {d.back}
          </Link>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {carousel?.title || d.editHeading}
          </h2>
          {carousel && (
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge carousel={carousel} />
              <span className="text-xs text-muted-foreground">
                {d.placementLabels[carousel.placement]}
              </span>
            </div>
          )}
        </div>
        {carousel && canWrite && (
          <RowActionsMenu
            label={dict.common.registry.rowActionsAria(carousel.title)}
            className="mt-6 size-11 border md:size-9"
            items={[
              {
                label: d.duplicate,
                onSelect: () => void handleDuplicate(carousel),
                disabled: busy,
              },
              {
                label: d.deleteAction,
                onSelect: () => void handleDelete(carousel),
                destructive: true,
                separatorBefore: true,
                disabled: busy,
              },
            ]}
          />
        )}
      </div>

      {isError && !isNotFound ? (
        <p role="alert" className="text-sm text-destructive">
          {d.loadOneError}
        </p>
      ) : carousel ? (
        <CarouselForm
          id={carouselId}
          defaultValues={mapCarouselToFormValues(carousel)}
          onSubmit={handleSubmit}
          isPending={update.isPending || setItems.isPending}
          submitLabel={dict.common.save}
          extraDirtySections={itemsDirty ? [dict.carouselItems.heading] : []}
          onDiscardExtra={() => setDraftItems(null)}
          renderItemsSection={(source) =>
            source === "MANUAL" ? (
              <ManualItemsPanel
                items={items}
                onChange={setDraftItems}
                isLoading={itemsQuery.isLoading}
                isError={itemsQuery.isError}
              />
            ) : (
              <AutoSourcePanel source={source} saved={carousel} />
            )
          }
        />
      ) : null}

      {confirmDialog}
    </div>
  );
}

/** «Опубліковано» / «Заплановано на …» / «Чернетка» (TASK-430 keeps the date). */
function StatusBadge({ carousel }: { carousel: CarouselEntity }) {
  if (carousel.status === "SCHEDULED") {
    return (
      <Badge variant="outline">
        {carousel.scheduledAt
          ? d.statusScheduledOn(formatDate(carousel.scheduledAt))
          : d.statusLabels.SCHEDULED}
      </Badge>
    );
  }
  return (
    <Badge variant={carousel.status === "PUBLISHED" ? "default" : "secondary"}>
      {d.statusLabels[carousel.status]}
    </Badge>
  );
}

/** Map a fetched carousel entity onto the form's string-based input shape. */
function mapCarouselToFormValues(
  carousel: CarouselEntity,
): Partial<CarouselFormInput> {
  return {
    title: carousel.title,
    source: carousel.source,
    placement: carousel.placement,
    categoryId: carousel.categoryId ?? "",
    itemLimit: String(carousel.itemLimit),
    status: carousel.status,
    // Seed the datetime-local input ("YYYY-MM-DDTHH:mm") from the ISO instant,
    // in KYIV time — the carousel list renders the same instant through the
    // Kyiv-pinned formatter. See `shared/lib/format/datetime-local.ts`.
    scheduledAt: carousel.scheduledAt
      ? toKyivDateTimeLocal(carousel.scheduledAt)
      : "",
  };
}
