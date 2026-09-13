"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
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
import { ProductDeleteAction } from "@/features/product-delete";
import { ProductImageManager } from "@/features/product-image-manager";
import { ProductDeviceCompatManager } from "@/features/product-device-compat";
import { ProductAddonDeltaPanel } from "@/features/product-addon-delta-panel";
import { ProductSpecsEditor } from "@/features/product-specs-editor";
import { ProductPublishPanel } from "@/features/product-publish-panel";
import { Separator } from "@/shared/ui";
import { formatKeywords } from "@/shared/lib/seo";
import { dict } from "@/shared/config";
import { apiErrorMessage } from "@/shared/lib";

interface EditProductViewProps {
  productId: string;
}

/**
 * Edit-product page body: fetches the product by UUID to pre-populate the form,
 * then wires the update mutation, cache invalidation and toasts.
 * A missing product (404) redirects back to the list.
 *
 * STAYING PUT AFTER A SAVE (TASK-427). Saving used to `router.push("/products")`
 * inside `onSuccess`, so an operator making three edits to one product navigated
 * back three times — and everything below the form (images, structured specs,
 * add-on deltas, device compatibility) saves through its own endpoints, so the
 * redirect also threw away the half-finished page they were actually working on.
 *
 * Removing it puts the burden on re-seeding, which is what `docs/conventions/
 * forms.md` Rule 2 exists for — a redirect hides a stale form, it does not fix
 * one. Re-checked here, and the pieces were already in place:
 *
 *   - `ProductForm` is a Rule 2a form: `values` + `resetOptions:
 *     { keepDirtyValues: true }`, not bare `defaultValues`. When the
 *     invalidation below lands, every field the operator did NOT touch takes the
 *     server's value; the fields they did touch keep what they just saved, which
 *     is by definition what the server now holds (the mutation returned 200).
 *   - Everything outside the form reads `data.data` directly, so the publish
 *     panel, the stock split and the specs editor all re-render from the
 *     refetch rather than from a snapshot taken at mount.
 *
 * The one thing `keepDirtyValues` cannot show is the server's own rewriting of a
 * field the operator personally edited — leaving the slug blank makes the API
 * generate one, and the (dirty) blank box stays blank. That is not a stale
 * value: the field means "auto-generate", the live preview under it shows the
 * slug the server would derive, and saving again derives the same one.
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
          // Unchanged, deliberately: the list must lose the stale row and this
          // product's own detail cache must be refetched. The refetch is what
          // makes staying on the page safe — see the note above the component.
          void queryClient.invalidateQueries({
            queryKey: getProductControllerAdminFindAllQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getProductControllerFindByIdQueryKey(productId),
          });
          toast.success(dict.products.toastUpdated);
          // TASK-427: no `router.push("/products")` here any more. Three edits
          // to one product used to cost three trips back through the list, and
          // the redirect also threw away the page the operator was working on
          // (images, specs, add-ons, device compatibility all live below the
          // form and all saved through their own endpoints).
        },
        onError: (mutationError) => {
          // TASK-397: the generic toast swallowed the server's own explanation,
          // turning a precise 400 ("Group ID must be a valid UUID") into an
          // unactionable "Не вдалося оновити товар" that took a live demo run to
          // diagnose. Show the API's words whenever it sends any.
          toast.error(
            apiErrorMessage(mutationError) ?? dict.products.toastUpdateFailed,
          );
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
            <div className="flex flex-wrap items-center gap-4">
              {/* TASK-427: the read-only card, linked both ways. */}
              <Link
                href={`/products/${productId}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                {dict.products.cardAction}
              </Link>
              <Link
                href={`/products/preview/${product.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary hover:underline"
              >
                {dict.products.previewLink}
              </Link>
              {/* Deleting from here leaves nothing to edit, so unlike the list
                  row this one navigates away. `replace`, not `push`: the edit
                  URL of a deleted product resolves to nothing, and Back must not
                  return to it. */}
              <ProductDeleteAction
                productId={productId}
                name={product.name}
                onDeleted={() => router.replace("/products")}
              />
            </div>
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
            id={productId}
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
  keywords?: string[];
  ogImage?: string | null;
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
    keywords: formatKeywords(product.keywords),
    ogImage: product.ogImage ?? "",
  };
}
