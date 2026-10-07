import { apiErrorCode, apiErrorMessage, apiErrorStatus } from "@/shared/lib";
import { dict } from "@/shared/config";

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
