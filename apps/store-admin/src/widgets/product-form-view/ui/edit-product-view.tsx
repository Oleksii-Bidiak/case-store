"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  ProductForm,
  productFormSectionLabel,
  productFormValuesToDto,
  productSaveErrorMessage,
  type ProductFormInput,
  type ProductFormSubmitContext,
  type ProductFormSubmitResult,
  type ProductFormValues,
} from "@/features/product-form";
import {
  getProductControllerAdminFindAllQueryKey,
  getProductControllerFindByIdQueryKey,
  useProductControllerFindById,
  useProductControllerUpdate,
} from "@/entities/product";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { ProductDeleteAction } from "@/features/product-delete";
import { ProductImageManager } from "@/features/product-image-manager";
import { ProductDeviceCompatManager } from "@/features/product-device-compat";
import { ProductAddonDeltaPanel } from "@/features/product-addon-delta-panel";
import { ProductSpecsEditor } from "@/features/product-specs-editor";
import {
  ProductPublishPanel,
  buildReadinessChecks,
  missingSections,
} from "@/features/product-publish-panel";
import { useProductImageControllerList } from "@/shared/api";
import {
  Badge,
  Button,
  FormAlert,
  RowActionsMenu,
  type RowActionItem,
} from "@/shared/ui";
import { formatKeywords } from "@/shared/lib/seo";
import type { SectionSaveController } from "@/shared/lib/section-save";
import { dict, STOREFRONT_URL } from "@/shared/config";
import { formatDate } from "@/shared/lib";
import {
  clearCreateCarryover,
  readCreateCarryover,
  type CreateCarryoverFailures,
} from "../model/create-carryover";

interface EditProductViewProps {
  productId: string;
}

interface SaveFailure {
  section: string;
  message: string;
  /** What did land before the failure. */
  saved: string[];
}

/**
 * Edit-product page body (ProductFormProposal Ф1–Ф5, wave 198, TASK-1050).
 *
 * ── One «Зберегти» ───────────────────────────────────────────────────────────
 * The product's fields, its structured specs and its device compatibility live
 * on three endpoints. They used to carry three save buttons, and an operator
 * who pressed only the bottom one lost the other two without a word. The page
 * now saves them as ONE action, in a fixed order — product → specs →
 * compatibility (specs after the product because a category change decides
 * which spec definitions are in scope). The first failure STOPS the chain: the
 * alert names the failed section in the server's words and says what already
 * landed, which stays saved; pressing «Зберегти» again retries only what is
 * still dirty. Photos and add-on exceptions keep saving per action — they were
 * never "pending", so they are not in the unsaved list either.
 *
 * ── Staying put after a save (TASK-427) ─────────────────────────────────────
 * No redirect: `ProductForm` re-seeds through `values` + `keepDirtyValues`
 * (forms.md Rule 2a) and marks itself pristine once its part is written; the
 * spec and compat sections compare against the refetched product.
 *
 * ── The address of a live product (TASK-285, Ф4) ────────────────────────────
 * Changed only through the form's «Змінити адресу товару?» dialog — the
 * `window.confirm` at save time is gone.
 */
export function EditProductView({ productId }: EditProductViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const { data, isLoading, isError, error } =
    useProductControllerFindById(productId);
  const update = useProductControllerUpdate();
  const images = useProductImageControllerList(productId);

  const isNotFound = error?.response?.status === 404;

  /**
   * TASK-442 — what did NOT land when this product was created with everything
   * at once. Read once per product id (forms.md Rule 1a render-time guard).
   */
  const [carryoverFor, setCarryoverFor] = useState(productId);
  const [carryover, setCarryover] = useState<CreateCarryoverFailures | null>(
    () => readCreateCarryover(productId),
  );
  if (carryoverFor !== productId) {
    setCarryoverFor(productId);
    setCarryover(readCreateCarryover(productId));
  }

  useEffect(() => {
    if (isNotFound) {
      router.replace("/products");
    }
  }, [isNotFound, router]);

  const specsRef = useRef<SectionSaveController>(null);
  const compatRef = useRef<SectionSaveController>(null);
  const [specsDirty, setSpecsDirty] = useState(false);
  const [compatDirty, setCompatDirty] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const product = data?.data;

  const handleSubmit = async (
    values: ProductFormValues,
    { mainDirty, mainSections }: ProductFormSubmitContext,
  ): Promise<ProductFormSubmitResult> => {
    setSaving(true);
    setFailure(null);
    const saved: string[] = [];
    let mainSaved = false;
    // Nothing marked dirty still writes the product, as the old button did —
    // «Зберегти» on an untouched page is a harmless re-save, never a no-op
    // that looks like it worked.
    const writeMain = mainDirty || (!specsDirty && !compatDirty);
    let current = productFormSectionLabel("main");
    try {
      if (writeMain) {
        await update.mutateAsync({
          id: productId,
          data: productFormValuesToDto(values, { isUpdate: true }),
        });
        mainSaved = true;
        saved.push(...mainSections);
        void queryClient.invalidateQueries({
          queryKey: getProductControllerAdminFindAllQueryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: getProductControllerFindByIdQueryKey(productId),
        });
      }
      if (specsDirty && specsRef.current) {
        current = productFormSectionLabel("specs");
        await specsRef.current.save();
        saved.push(current);
      }
      if (compatDirty && compatRef.current) {
        current = productFormSectionLabel("compat");
        await compatRef.current.save();
        saved.push(current);
      }
      toast.success(dict.products.toastUpdated);
    } catch (saveError) {
      // TASK-397: the server's own words whenever it sends any.
      const message = productSaveErrorMessage(saveError);
      if (!mainSaved && writeMain) {
        toast.error(message ?? dict.products.toastUpdateFailed);
      } else {
        toast.error(message ?? dict.productForm.saveFailedGeneric);
      }
      setFailure({
        section: current,
        message: message ?? dict.productForm.saveFailedGeneric,
        saved,
      });
    } finally {
      setSaving(false);
    }
    return { mainSaved };
  };

  const readinessMissing = product
    ? missingSections(
        buildReadinessChecks({
          name: product.name,
          categoryId: product.categoryId,
          price: product.price,
          stock: product.stock,
          description: product.description,
          imageCount: images.data?.data?.length ?? 0,
          specCount: product.specs?.length ?? 0,
          compatCount: product.compatibleDeviceModels?.length ?? 0,
        }),
      )
    : [];

  const menuItems: RowActionItem[] = [
    { label: dict.products.menuCard, href: `/products/${productId}` },
    ...(product
      ? [
          {
            label: dict.products.menuPreview,
            href: `/products/preview/${product.slug}`,
            newTab: true,
          },
        ]
      : []),
    ...(can(PERM.productsDelete)
      ? [
          {
            label: dict.products.rowDelete,
            onSelect: () => setDeleteOpen(true),
            destructive: true,
            separatorBefore: true,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link
          href="/products"
          className="self-start text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.products.back}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {product?.name ?? dict.products.editHeading}
            </h2>
            {product ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {product.isActive ? (
                  <Badge>{dict.products.statusShown}</Badge>
                ) : (
                  <Badge variant="secondary">
                    {dict.products.statusHidden}
                  </Badge>
                )}
                <span>
                  {dict.products.editMeta(
                    product.sku ?? "",
                    formatDate(product.updatedAt),
                  )}
                </span>
              </div>
            ) : null}
          </div>
          {product ? (
            <div className="flex items-center gap-2">
              {/* Only a product the storefront serves has a page to open —
                  a hidden one would 404 there (its preview is TASK-670). */}
              {product.isActive ? (
                <Button asChild variant="outline">
                  <a
                    href={`${STOREFRONT_URL}/products/${product.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {dict.products.viewOnSite}
                    <ExternalLinkIcon aria-hidden="true" />
                  </a>
                </Button>
              ) : null}
              <RowActionsMenu
                label={dict.products.headerMoreAria}
                items={menuItems}
                className="size-9 border"
              />
            </div>
          ) : null}
        </div>
      </div>

      {carryover && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-4"
        >
          <h3 className="text-sm font-semibold text-destructive">
            {dict.products.createCarryover.heading}
          </h3>
          <p className="text-sm text-foreground">
            {dict.products.createCarryover.intro}
          </p>
          <ul className="list-disc pl-5 text-sm text-foreground">
            {carryover.images.length > 0 && (
              <li>{dict.products.createCarryover.images(carryover.images)}</li>
            )}
            {carryover.specs && <li>{dict.products.createCarryover.specs}</li>}
            {carryover.compat && (
              <li>{dict.products.createCarryover.compat}</li>
            )}
            {carryover.addons.length > 0 && (
              <li>{dict.products.createCarryover.addons(carryover.addons)}</li>
            )}
          </ul>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                clearCreateCarryover();
                setCarryover(null);
              }}
            >
              {dict.products.createCarryover.dismiss}
            </Button>
          </div>
        </div>
      )}

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
        <ProductForm
          id={productId}
          defaultValues={mapProductToFormValues(product)}
          onSubmit={handleSubmit}
          isPending={isSaving}
          submitLabel={dict.common.save}
          stockInfo={{
            reservedQty: product.reservedQty,
            physicalQty: product.physicalQty,
          }}
          slugLocked={product.isActive}
          externalDirty={{ specs: specsDirty, compat: compatDirty }}
          missingSections={readinessMissing}
          onDiscard={() => {
            specsRef.current?.discard();
            compatRef.current?.discard();
            setFailure(null);
          }}
          alert={
            failure ? (
              <FormAlert>
                <p>
                  {dict.productForm.saveFailed(
                    failure.section,
                    failure.message,
                  )}
                </p>
                {failure.saved.length > 0 ? (
                  <p>
                    {dict.productForm.savedPartly(failure.saved.join(", "))}
                  </p>
                ) : null}
              </FormAlert>
            ) : null
          }
          renderSpecsSection={(categoryId) => (
            <ProductSpecsEditor
              embedded
              productId={productId}
              categoryId={categoryId}
              initialSpecs={product.specs}
              controllerRef={specsRef}
              onDirtyChange={setSpecsDirty}
            />
          )}
          photosSection={<ProductImageManager productId={productId} />}
          compatSection={
            <ProductDeviceCompatManager
              productId={productId}
              groupId={product.groupId ?? null}
              initialModelIds={(product.compatibleDeviceModels ?? []).map(
                (model) => model.id,
              )}
              controllerRef={compatRef}
              onDirtyChange={setCompatDirty}
            />
          }
          // Per-product add-on exceptions (TASK-174) — saved per action
          // through their own endpoints, never part of «Зберегти».
          addonsSection={<ProductAddonDeltaPanel productId={productId} />}
          aside={
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
          }
        />
      ) : null}

      {product && deleteOpen ? (
        // Deleting from here leaves nothing to edit: `replace`, so Back does
        // not return to the edit URL of a product that no longer resolves.
        <ProductDeleteAction
          productId={productId}
          name={product.name}
          open
          onOpenChange={setDeleteOpen}
          onDeleted={() => router.replace("/products")}
        />
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
