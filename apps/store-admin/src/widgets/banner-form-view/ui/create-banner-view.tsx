"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  BannerForm,
  BANNER_PLACEMENT,
  bannerFormValuesToCreateDto,
  type BannerFormValues,
  type BannerPlacementValue,
} from "@/features/banner-form";
import {
  getAdminBannerControllerFindAllQueryKey,
  useAdminBannerControllerCreate,
} from "@/entities/banner";
import { dict } from "@/shared/config";

function placementFromQuery(
  value: string | null,
): BannerPlacementValue | undefined {
  return (BANNER_PLACEMENT as readonly string[]).includes(value ?? "")
    ? (value as BannerPlacementValue)
    : undefined;
}

/**
 * Create-banner body: renders the form and wires the create mutation, list-cache
 * invalidation, toasts, and redirect back to the list. `?placement=` — set by a
 * section's «Додати сюди» (TASK-1073) — preselects where the banner goes.
 */
export function CreateBannerView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useAdminBannerControllerCreate();
  const placement = placementFromQuery(useSearchParams().get("placement"));

  const handleSubmit = (values: BannerFormValues) => {
    create.mutate(
      { data: bannerFormValuesToCreateDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminBannerControllerFindAllQueryKey(),
          });
          toast.success(dict.banners.toastCreated);
          router.push("/banners");
        },
        onError: () => {
          toast.error(dict.banners.toastCreateFailed);
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
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.banners.createHeading}
        </h2>
      </div>

      <BannerForm
        defaultValues={placement ? { placement } : undefined}
        onSubmit={handleSubmit}
        isPending={create.isPending}
        submitLabel={dict.banners.createSubmit}
      />
    </div>
  );
}
