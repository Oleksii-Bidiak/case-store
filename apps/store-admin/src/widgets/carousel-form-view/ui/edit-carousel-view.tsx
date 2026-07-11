"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CarouselForm,
  carouselFormValuesToUpdateDto,
  type CarouselFormInput,
  type CarouselFormValues,
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
            ) : null
          }
        />
      ) : null}
    </div>
  );
}

/** Map a fetched carousel entity onto the form's string-based input shape. */
function mapCarouselToFormValues(
  carousel: CarouselEntity,
): Partial<CarouselFormInput> {
  return {
    title: carousel.title,
    source: carousel.source,
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
