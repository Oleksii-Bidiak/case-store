import type { UseFormSetError } from "react-hook-form";
import { apiErrorCode, apiErrorMessage, apiErrorStatus } from "@/shared/lib";
import {
  applyServerFieldErrors,
  type ServerFieldMap,
} from "@/shared/lib/form-errors";
import { dict } from "@/shared/config";
import type { ProductFormInput } from "./product-schema";

/**
 * What a refused product save (`POST /products`, `PUT /products/:id`) says to
 * the operator, or `undefined` when the server sent no words of its own (the
 * caller then falls back to its generic text).
 *
 * The server's own message is shown as before (TASK-397), except for the codes
 * the admin words itself:
 *
 * - 409 `PRODUCT_CATEGORY_BUSY` — a category delete held the category tree
 *   lock longer than a save may wait. Nothing was written and the very same
 *   save can simply be repeated, which the API's English text does not say to
 *   a Ukrainian operator. The STATUS decides, the code refines
 *   (`api-error-message.ts`).
 * - 400 `PRODUCT_CATEGORY_GONE` (TASK-1831) — the picked category was deleted
 *   while the form was open; the API's «Category not found» says neither that
 *   nor what to do.
 */
export function productSaveErrorMessage(error: unknown): string | undefined {
  const status = apiErrorStatus(error);
  const code = apiErrorCode(error);
  if (status === 409 && code === "PRODUCT_CATEGORY_BUSY") {
    return dict.productForm.errorCategoryBusy;
  }
  if (status === 400 && code === "PRODUCT_CATEGORY_GONE") {
    return dict.productForm.errorCategoryGone;
  }
  return apiErrorMessage(error);
}

/**
 * `CreateProductDto` / `UpdateProductDto` paths → form fields (forms Rule 6b).
 * `attributes` is left out on purpose: the key-value rows have no single field
 * to hold a refusal of the object, so it stays a toast.
 */
export const PRODUCT_FIELD_MAP: ServerFieldMap = {
  name: "name",
  slug: "slug",
  description: "description",
  price: "price",
  compareAtPrice: "compareAtPrice",
  sku: "sku",
  stock: "stock",
  categoryId: "categoryId",
  groupId: "groupId",
  brandId: "brandId",
  positionOrder: "positionOrder",
  metaTitle: "metaTitle",
  metaDescription: "metaDescription",
  keywords: "keywords",
  "keywords.*": "keywords",
  ogImage: "ogImage",
};

/**
 * Puts a refused product save under the field it is about (TASK-1984, forms
 * Rule 6b) and says whether it did. `true` means every part of the refusal is
 * on a field and nothing else may be shown; `false` leaves it to the caller's
 * toast ({@link productSaveErrorMessage}).
 *
 * - 409 `PRODUCT_SLUG_CONFLICT` / `PRODUCT_SKU_CONFLICT` — the slug / SKU is
 *   held by another product (the codes the restore dialog keys off too);
 * - 400 `PRODUCT_CATEGORY_GONE` — the picked category was deleted meanwhile;
 * - any other 400 — through the API's `fieldErrors`.
 */
export function placeProductSaveError(
  error: unknown,
  setError: UseFormSetError<ProductFormInput>,
): boolean {
  const status = apiErrorStatus(error);
  const code = apiErrorCode(error);
  const e = dict.productForm.errors;
  if (status === 409 && code === "PRODUCT_SLUG_CONFLICT") {
    setError("slug", { type: "server", message: e.slugTaken });
    return true;
  }
  if (status === 409 && code === "PRODUCT_SKU_CONFLICT") {
    setError("sku", { type: "server", message: e.skuTaken });
    return true;
  }
  if (status === 400 && code === "PRODUCT_CATEGORY_GONE") {
    setError("categoryId", {
      type: "server",
      message: dict.productForm.errorCategoryGone,
    });
    return true;
  }
  if (status === 400) {
    const { mapped, unmapped } = applyServerFieldErrors(
      error,
      setError,
      PRODUCT_FIELD_MAP,
    );
    return mapped.length > 0 && unmapped.length === 0;
  }
  return false;
}
