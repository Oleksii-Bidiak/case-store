"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BannerForm,
  bannerFormValuesToUpdateDto,
  type BannerFormInput,
  type BannerFormValues,
} from "@/features/banner-form";
import {
  getAdminBannerControllerFindAllQueryKey,
  getAdminBannerControllerFindByIdQueryKey,
  useAdminBannerControllerFindById,
  useAdminBannerControllerUpdate,
  type BannerEntity,
} from "@/entities/banner";
import { dict } from "@/shared/config";

interface EditBannerViewProps {
  bannerId: string;
}

/**
 * Edit-banner body: fetches the banner by UUID to pre-populate the form, then
 * wires the update mutation, cache invalidation, toasts, and redirect. A missing
 * banner (404) redirects back to the list.
 */
export function EditBannerView({ bannerId }: EditBannerViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } =
    useAdminBannerControllerFindById(bannerId);
  const update = useAdminBannerControllerUpdate();

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/banners");
    }
  }, [isNotFound, router]);

  const banner = data?.data;

  const handleSubmit = (values: BannerFormValues) => {
    update.mutate(
      { id: bannerId, data: bannerFormValuesToUpdateDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminBannerControllerFindAllQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminBannerControllerFindByIdQueryKey(bannerId),
          });
          toast.success(dict.banners.toastUpdated);
          router.push("/banners");
        },
        onError: () => {
          toast.error(dict.banners.toastUpdateFailed);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/banners"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.banners.back}
        </Link>
        <h2 className="text-2xl font-bold text-foreground">
          {dict.banners.editHeading}
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
          {dict.banners.loadOneError}
        </p>
      ) : banner ? (
        <BannerForm
          id={bannerId}
          defaultValues={mapBannerToFormValues(banner)}
          onSubmit={handleSubmit}
          isPending={update.isPending}
          submitLabel={dict.common.saveChanges}
        />
      ) : null}
    </div>
  );
}

/** Map a fetched banner entity onto the form's string-based input shape. */
function mapBannerToFormValues(banner: BannerEntity): Partial<BannerFormInput> {
  return {
    placement: banner.placement,
    title: banner.title,
    subtitle: banner.subtitle ?? "",
    imageUrl: banner.imageUrl ?? "",
    ctaLabel: banner.ctaLabel ?? "",
    ctaHref: banner.ctaHref ?? "",
    theme: banner.theme ?? "",
    sortOrder: String(banner.sortOrder),
    status: banner.status,
    // Seed the datetime-local input ("YYYY-MM-DDTHH:mm") from the ISO instant.
    scheduledAt: banner.scheduledAt ? toDateTimeLocal(banner.scheduledAt) : "",
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
