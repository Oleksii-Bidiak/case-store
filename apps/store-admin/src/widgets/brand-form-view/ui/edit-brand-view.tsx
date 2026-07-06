"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BrandForm,
  brandFormValuesToDto,
  type BrandFormInput,
  type BrandFormValues,
} from "@/features/brand-form";
import {
  getBrandControllerAdminFindAllQueryKey,
  getBrandControllerFindByIdQueryKey,
  useBrandControllerFindById,
  useAdminBrandControllerUpdate,
  type BrandEntity,
} from "@/entities/brand";
import { dict } from "@/shared/config";

interface EditBrandViewProps {
  brandId: string;
}

/**
 * Edit-brand body: fetches the brand by UUID to pre-populate the form, then
 * wires the update mutation, cache invalidation, toasts, and redirect. A missing
 * brand (404) redirects back to the list.
 */
export function EditBrandView({ brandId }: EditBrandViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } =
    useBrandControllerFindById(brandId);
  const update = useAdminBrandControllerUpdate();

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/brands");
    }
  }, [isNotFound, router]);

  const brand = data?.data;

  const handleSubmit = (values: BrandFormValues) => {
    update.mutate(
      { id: brandId, data: brandFormValuesToDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getBrandControllerAdminFindAllQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getBrandControllerFindByIdQueryKey(brandId),
          });
          toast.success(dict.brands.toastUpdated);
          router.push("/brands");
        },
        onError: () => {
          toast.error(dict.brands.toastUpdateFailed);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/brands"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.brands.back}
        </Link>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.brands.editHeading}
        </h2>
      </div>

      {isLoading ? (
        <div className="flex max-w-2xl flex-col gap-5">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-10 w-full animate-pulse rounded bg-muted"
            />
          ))}
        </div>
      ) : isError && !isNotFound ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.brands.loadOneError}
        </p>
      ) : brand ? (
        <BrandForm
          id={brandId}
          defaultValues={mapBrandToFormValues(brand)}
          onSubmit={handleSubmit}
          isPending={update.isPending}
          submitLabel={dict.common.saveChanges}
        />
      ) : null}
    </div>
  );
}

/** Map a fetched brand entity onto the form's string-based input shape. */
function mapBrandToFormValues(brand: BrandEntity): Partial<BrandFormInput> {
  return {
    name: brand.name,
    slug: brand.slug,
    logo: brand.logo ?? "",
    isActive: brand.isActive,
  };
}
