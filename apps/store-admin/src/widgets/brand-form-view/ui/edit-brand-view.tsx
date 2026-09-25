"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
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
import { CopyButton } from "@/shared/ui";

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

      {brand ? <BrandIdRow id={brand.id} /> : null}

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

/**
 * The brand's uuid as selectable text plus a copy button (TASK-831).
 *
 * The storefront still honours pre-TASK-420 `?brandId=<uuid>` links by
 * redirecting them to `?brand=<slug>`; without this row an operator had no way
 * to get the uuid short of database access. The text stays visible and
 * `select-all` because `CopyButton` can fail (insecure origin), and the manual
 * selection is the fallback it tells the operator to use.
 */
function BrandIdRow({ id }: { id: string }) {
  const d = dict.brands;
  return (
    // The label names the GROUP, not the <code>: `code` has an implicit role
    // that takes no accessible name, so `aria-labelledby` on it was dropped by
    // assistive tech. A named group reads «ID бренду, група» and then the uuid.
    <div
      role="group"
      aria-labelledby="brand-id-label"
      className="flex max-w-2xl flex-col gap-2 rounded-md border border-border p-3"
    >
      <p id="brand-id-label" className="text-xs font-medium text-foreground">
        {d.idLabel}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-all text-foreground select-all">
          {id}
        </code>
        <CopyButton
          value={id}
          label={d.copyId}
          copiedLabel={d.copyIdDone}
          failedLabel={d.copyIdFailed}
          ariaLabel={d.copyIdAria}
        />
      </div>
      <p className="text-xs text-muted-foreground">{d.idHint}</p>
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
