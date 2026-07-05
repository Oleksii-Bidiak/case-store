"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BannerForm,
  bannerFormValuesToCreateDto,
  type BannerFormValues,
} from "@/features/banner-form";
import {
  getAdminBannerControllerFindAllQueryKey,
  useAdminBannerControllerCreate,
} from "@/entities/banner";
import { dict } from "@/shared/config";

/**
 * Create-banner body: renders the form and wires the create mutation, list-cache
 * invalidation, toasts, and redirect back to the list.
 */
export function CreateBannerView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useAdminBannerControllerCreate();

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
        <h2 className="text-2xl font-bold text-foreground">
          {dict.banners.createHeading}
        </h2>
      </div>

      <BannerForm
        onSubmit={handleSubmit}
        isPending={create.isPending}
        submitLabel={dict.banners.createSubmit}
      />
    </div>
  );
}
