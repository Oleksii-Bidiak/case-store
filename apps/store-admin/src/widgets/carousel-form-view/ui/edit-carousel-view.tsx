"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  CarouselForm,
  carouselFormValuesToUpdateDto,
  type CarouselFormInput,
  type CarouselFormValues,
  type CarouselSourceValue,
} from "@/features/carousel-form";
import { CarouselItemPicker } from "@/features/carousel-item-picker";
import {
  getAdminCarouselControllerFindAllQueryKey,
  getAdminCarouselControllerFindByIdQueryKey,
  useAdminCarouselControllerFindById,
  useAdminCarouselControllerUpdate,
  type CarouselEntity,
} from "@/entities/carousel";
import { dict } from "@/shared/config";

interface EditCarouselViewProps {
  carouselId: string;
}

/**
 * Edit-carousel body: fetches the carousel by UUID to pre-populate the form,
 * then wires the update mutation, cache invalidation, toasts, and redirect. A
 * missing carousel (404) redirects back to the list. The MANUAL item picker
 * renders through the form's `renderItemsSection` slot, gated on the LIVE
 * source select value — flipping the select shows/hides the panel before
 * saving (client-side gate; the backend accepts staged item writes on any
 * source, they are inert until the source is MANUAL).
 *
 * AD-CNT-25 (TASK-429): every OTHER source now renders
 * {@link AutoSourceItemsNotice} instead of nothing, so "no picker" reads as
 * "this carousel fills itself" rather than as a broken screen.
 */
export function EditCarouselView({ carouselId }: EditCarouselViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } =
    useAdminCarouselControllerFindById(carouselId);
  const update = useAdminCarouselControllerUpdate();

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/carousels");
    }
  }, [isNotFound, router]);

  const carousel = data?.data;

  const handleSubmit = (values: CarouselFormValues) => {
    update.mutate(
      { id: carouselId, data: carouselFormValuesToUpdateDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminCarouselControllerFindAllQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminCarouselControllerFindByIdQueryKey(carouselId),
          });
          toast.success(dict.carousels.toastUpdated);
          router.push("/carousels");
        },
        onError: () => {
          toast.error(dict.carousels.toastUpdateFailed);
        },
      },
    );
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
          {dict.carousels.editHeading}
        </h2>
      </div>

      {isLoading ? (
        <div className="flex max-w-2xl flex-col gap-5">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-10 w-full animate-pulse rounded bg-muted"
            />
          ))}
        </div>
      ) : isError && !isNotFound ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.carousels.loadOneError}
        </p>
      ) : carousel ? (
        <CarouselForm
          id={carouselId}
          defaultValues={mapCarouselToFormValues(carousel)}
          onSubmit={handleSubmit}
          isPending={update.isPending}
          submitLabel={dict.common.saveChanges}
          renderItemsSection={(source) =>
            source === "MANUAL" ? (
              <CarouselItemPicker carouselId={carouselId} />
            ) : (
              <AutoSourceItemsNotice source={source} />
            )
          }
        />
      ) : null}
    </div>
  );
}

/**
 * The panel that stands where the MANUAL item picker would be for every OTHER
 * source (AD-CNT-25, TASK-429).
 *
 * Until now this slot rendered `null`, and that silence was read as a bug: the
 * operator switched a carousel to «Хіти продажів», found no product list and no
 * explanation, and reported that reordering was broken. Nothing was broken — an
 * automatic carousel has no hand-made order to edit — but a screen that omits the
 * section cannot say so. This says it, names the source that is in charge, and
 * spells out the one action that brings the picker back.
 *
 * Deliberately NOT a disabled `CarouselItemPicker`: that component fetches the
 * carousel's items and runs a product search, and a greyed-out search box that
 * cannot be used is a worse answer than a sentence explaining why it is absent.
 */
function AutoSourceItemsNotice({ source }: { source: CarouselSourceValue }) {
  return (
    <section
      aria-label={dict.carouselItems.heading}
      className="flex max-w-2xl flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-4"
    >
      <h3 className="text-lg font-semibold text-foreground">
        {dict.carouselItems.autoHeading}
      </h3>
      <p className="text-sm text-muted-foreground">
        {dict.carouselItems.autoHint(dict.carouselForm.sourceOptions[source])}
      </p>
      <p className="text-sm text-muted-foreground">
        {dict.carouselItems.autoSwitchHint}
      </p>
    </section>
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
    sortOrder: String(carousel.sortOrder),
    status: carousel.status,
    // Seed the datetime-local input ("YYYY-MM-DDTHH:mm") from the ISO instant.
    scheduledAt: carousel.scheduledAt
      ? toDateTimeLocal(carousel.scheduledAt)
      : "",
  };
}

/** Convert an ISO instant to the `datetime-local` input value (local time). */
function toDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
