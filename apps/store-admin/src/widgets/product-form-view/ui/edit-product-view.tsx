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
import { ProductSpecsEditor } from "@/features/product-specs-editor";
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
    update.mutate(
      { id: productId, data: productFormValuesToDto(values) },
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
          <ProductForm
            defaultValues={mapProductToFormValues(product)}
            onSubmit={handleSubmit}
            isPending={update.isPending}
            submitLabel={dict.common.saveChanges}
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
  isActive: boolean;
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
    isActive: product.isActive,
    metaTitle: product.metaTitle ?? "",
    metaDescription: product.metaDescription ?? "",
  };
}
