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
  getProductControllerFindAllQueryKey,
  getProductControllerFindByIdQueryKey,
  useProductControllerFindById,
  useProductControllerUpdate,
} from "@/entities/product";
import { ProductImageManager } from "@/features/product-image-manager";
import { Separator } from "@/shared/ui";

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
            queryKey: getProductControllerFindAllQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getProductControllerFindByIdQueryKey(productId),
          });
          toast.success("Product updated");
          router.push("/products");
        },
        onError: () => {
          toast.error("Failed to update product");
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
          ← Back to products
        </Link>
        <h2 className="text-2xl font-bold text-foreground">Edit Product</h2>
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
          Failed to load product. Please try again.
        </p>
      ) : product ? (
        <div className="flex max-w-2xl flex-col gap-6">
          <ProductForm
            defaultValues={mapProductToFormValues(product)}
            onSubmit={handleSubmit}
            isPending={update.isPending}
            submitLabel="Save changes"
          />

          <Separator />

          <section className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-foreground">
              Product Images
            </h3>
            <ProductImageManager productId={productId} />
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
  attributes?: Record<string, unknown> | null;
  positionOrder: number;
  isActive: boolean;
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
    positionOrder: String(product.positionOrder),
    attributes: Object.entries(product.attributes ?? {}).map(
      ([key, value]) => ({
        key,
        value: typeof value === "string" ? value : String(value ?? ""),
      }),
    ),
    isActive: product.isActive,
  };
}
