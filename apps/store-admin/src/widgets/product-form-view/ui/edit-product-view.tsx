"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ProductForm,
  productFormValuesToDto,
  type ProductFormInput,
  type ProductFormValues,
} from "@/features/product-form";
import {
  getProductControllerAdminFindAllQueryKey,
  getProductControllerFindByIdQueryKey,
  useProductControllerFindById,
  useProductControllerUpdate,
} from "@/entities/product";
import { ProductImageManager } from "@/features/product-image-manager";
import { ProductDeviceCompatManager } from "@/features/product-device-compat";
import { ProductAddonDeltaPanel } from "@/features/product-addon-delta-panel";
import { ProductSpecsEditor } from "@/features/product-specs-editor";
import { ProductPublishPanel } from "@/features/product-publish-panel";
import { Separator } from "@/shared/ui";
import { dict } from "@/shared/config";

interface EditProductViewProps {
  productId: string;
}

/**
 * Edit-product page body: fetches the product by UUID to pre-populate the form,
 * then wires the update mutation, cache invalidation, toasts, and redirect.
 * A missing product (404) redirects back to the list.
 */
export function EditProductView({ productId }: EditProductViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } =
    useProductControllerFindById(productId);
  const update = useProductControllerUpdate();

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/products");
    }
  }, [isNotFound, router]);

  const product = data?.data;

  const handleSubmit = (values: ProductFormValues) => {
    // TASK-285: renaming an ACTIVE product's slug kills its indexed URL — warn
    // first. A blank slug means "auto-generate" (treated as no rename here).
    const nextSlug = values.slug?.trim();
    const wasLive = product?.isActive === true;
    if (wasLive && product && nextSlug && nextSlug !== product.slug) {
      if (
        !window.confirm(dict.products.slugChangeConfirm(product.slug, nextSlug))
      ) {
        return;
      }
    }
    update.mutate(
      {
        id: productId,
        data: productFormValuesToDto(values, { isUpdate: true }),
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getProductControllerAdminFindAllQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getProductControllerFindByIdQueryKey(productId),
          });
          toast.success(dict.products.toastUpdated);
          router.push("/products");
        },
        onError: () => {
          toast.error(dict.products.toastUpdateFailed);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/products"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.products.back}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {dict.products.editHeading}
          </h2>
          {product && (
            <Link
              href={`/products/preview/${product.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-primary hover:underline"
            >
              {dict.products.previewLink}
            </Link>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex max-w-2xl flex-col gap-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-10 w-full animate-pulse rounded bg-muted"
            />
          ))}
        </div>
      ) : isError && !isNotFound ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.products.loadOneError}
        </p>
      ) : product ? (
        <div className="flex max-w-2xl flex-col gap-6">
          {/* Publication first (TASK-361): whether this product is on sale is
              the operator's most consequential question, and after the
              create → edit hand-off it is also the only step left. */}
          <ProductPublishPanel
            productId={productId}
            isActive={product.isActive}
            name={product.name}
            categoryId={product.categoryId}
            price={product.price}
            stock={product.stock}
            description={product.description}
            specCount={product.specs?.length ?? 0}
            compatCount={product.compatibleDeviceModels?.length ?? 0}
          />

          <ProductForm
            defaultValues={mapProductToFormValues(product)}
            onSubmit={handleSubmit}
            isPending={update.isPending}
            submitLabel={dict.common.saveChanges}
            stockInfo={{
              reservedQty: product.reservedQty,
              physicalQty: product.physicalQty,
            }}
            renderSpecsSection={(categoryId) => (
              <>
                <Separator />
                <ProductSpecsEditor
                  productId={productId}
                  categoryId={categoryId}
                  initialSpecs={product.specs}
                />
              </>
            )}
          />

          <Separator />

          <section className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-foreground">
              {dict.products.imagesHeading}
            </h3>
            <ProductImageManager productId={productId} />
          </section>

          <Separator />

          {/* Per-product add-on exceptions (TASK-174). The product inherits its
              category's template automatically; this panel owns only the
              ADD/REMOVE/OVERRIDE deltas, via its own endpoints — deliberately
              not part of the product form's submit. */}
          <ProductAddonDeltaPanel productId={productId} />

          <Separator />

          <section className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-foreground">
              {dict.productCompat.title}
            </h3>
            <ProductDeviceCompatManager
              productId={productId}
              groupId={product.groupId ?? null}
              initialModelIds={(product.compatibleDeviceModels ?? []).map(
                (model) => model.id,
              )}
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}

/** Map a fetched product entity onto the form's string-based input shape. */
function mapProductToFormValues(product: {
  name: string;
  slug: string;
  description?: string | null;
  price: string;
  compareAtPrice?: string | null;
  sku?: string | null;
  stock: number;
  categoryId: string;
  groupId?: string | null;
  brand?: { id: string } | null;
  attributes?: Record<string, unknown> | null;
  positionOrder: number;
  metaTitle?: string | null;
  metaDescription?: string | null;
}): Partial<ProductFormInput> {
  return {
    name: product.name,
    slug: product.slug,
    description: product.description ?? "",
    price: product.price,
    compareAtPrice: product.compareAtPrice ?? "",
    sku: product.sku ?? "",
    stock: String(product.stock),
    categoryId: product.categoryId,
    groupId: product.groupId ?? "",
    brandId: product.brand?.id ?? "",
    positionOrder: String(product.positionOrder),
    attributes: Object.entries(product.attributes ?? {}).map(
      ([key, value]) => ({
        key,
        value: typeof value === "string" ? value : String(value ?? ""),
      }),
    ),
    // `isActive` is not a form field (TASK-361) — see ProductPublishPanel.
    metaTitle: product.metaTitle ?? "",
    metaDescription: product.metaDescription ?? "",
  };
}
