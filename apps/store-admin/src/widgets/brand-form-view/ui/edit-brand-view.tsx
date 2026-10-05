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
import { PERM } from "@/entities/permission";
import { useProductControllerAdminFindAll } from "@/entities/product";
import { useAuth } from "@/entities/session";
import { dict } from "@/shared/config";
import { formatDateTime } from "@/shared/lib/format/formatDate";
import { Badge, CollapsibleSection, CopyButton } from "@/shared/ui";
import { BrandFormSkeleton } from "./brand-form-skeleton";

const d = dict.brands;

interface EditBrandViewProps {
  brandId: string;
}

/**
 * Edit-brand page (wave 198, BrandsProposal БР5, БР9, TASK-1078).
 *
 * Header: «← Бренди», the brand's name and its site status. Body: the
 * sectioned form, and beside it the side panel — the product count (a link
 * into «Товари» filtered by the brand), «Змінено», and the uuid folded under
 * «Технічне» (TASK-831). Without `brands:write` the same page is view-only.
 *
 * The count comes from the products registry's own `meta.total` — the single
 * brand endpoint carries no `productCount` — and only for a session that may
 * open «Товари». «На сайті» (a `/brands/<slug>` page) is TASK-1080.
 *
 * A missing brand (404) redirects back to the list.
 */
export function EditBrandView({ brandId }: EditBrandViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canWrite = can(PERM.brandsWrite);
  const canOpenProducts = can(PERM.productsRead);

  const { data, isLoading, isError, error } =
    useBrandControllerFindById(brandId);
  const update = useAdminBrandControllerUpdate();
  const productCount = useProductControllerAdminFindAll(
    { brandId, page: 1, limit: 1 },
    { query: { enabled: canOpenProducts } },
  );

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
          toast.success(d.toastUpdated);
          router.push("/brands");
        },
        onError: () => {
          toast.error(d.toastUpdateFailed);
        },
      },
    );
  };

  if (isLoading) return <BrandFormSkeleton withAside />;

  const productsTotal = productCount.data?.meta?.total;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/brands"
          className="w-fit text-sm text-muted-foreground hover:text-foreground"
        >
          {d.back}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {brand?.name ?? d.editHeading}
          </h2>
          {brand ? (
            <Badge variant={brand.isActive ? "default" : "secondary"}>
              {brand.isActive ? d.statusActive : d.statusInactive}
            </Badge>
          ) : null}
        </div>
      </div>

      {isError && !isNotFound ? (
        <p role="alert" className="text-sm text-destructive">
          {d.loadOneError}
        </p>
      ) : brand ? (
        <BrandForm
          id={brandId}
          defaultValues={mapBrandToFormValues(brand)}
          onSubmit={handleSubmit}
          isPending={update.isPending}
          submitLabel={dict.common.save}
          readOnly={!canWrite}
          aside={
            <>
              <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm shadow-card">
                {canOpenProducts ? (
                  <Fact label={d.asideProducts}>
                    {productsTotal === undefined ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Link
                        href={`/products?brandId=${encodeURIComponent(brand.id)}`}
                        className="rounded-xs font-medium text-primary tabular-nums outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {productsTotal} →
                      </Link>
                    )}
                  </Fact>
                ) : null}
                <Fact label={d.asideUpdated}>
                  <span className="tabular-nums">
                    {formatDateTime(brand.updatedAt)}
                  </span>
                </Fact>
              </div>
              <CollapsibleSection title={d.technicalTitle}>
                <BrandIdRow id={brand.id} />
              </CollapsibleSection>
            </>
          }
        />
      ) : null}
    </div>
  );
}

/** One «label … value» line of the side panel. */
function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      {children}
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
  return (
    // The label names the GROUP, not the <code>: `code` has an implicit role
    // that takes no accessible name, so `aria-labelledby` on it was dropped by
    // assistive tech. A named group reads «ID бренду, група» and then the uuid.
    <div
      role="group"
      aria-labelledby="brand-id-label"
      className="flex flex-col gap-2"
    >
      <p id="brand-id-label" className="sr-only">
        {d.idLabel}
      </p>
      <code className="rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-all text-foreground select-all">
        {id}
      </code>
      <div>
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
