import { apiErrorCode, apiErrorStatus } from "@/shared/lib";
import { dict } from "@/shared/config";

const d = dict.products;

/**
 * What a refused `POST /products/:id/restore` means for the operator, for
 * every refusal that is NOT a slot conflict (those open Т10 instead — see
 * `conflictFromCode`). The STATUS decides and the code only refines
 * (`api-error-message.ts`).
 *
 * - 403 — no `products:delete` (the button is gated, but the grant can be
 *   revoked while the screen is open);
 * - 404 — no tombstone with this id: somebody restored it first;
 * - 400 `PRODUCT_CATEGORY_GONE` — the product's category was deleted
 *   (TASK-1831: the API names it now, so nothing is guessed from the status
 *   or from whether the body was empty); any other 400 is the DTO, which the
 *   dialog validates with the same rules first — the generic text is honest;
 * - 409 `PRODUCT_CATEGORY_BUSY` — a category delete held the category tree
 *   lock longer than the restore may wait: try again in a moment. (The slot
 *   conflicts are 409s too, but `conflictFromCode` takes those first.)
 *
 * A restore is one write, so every text can say «нічого не змінилося».
 */
export function restoreErrorMessage(error: unknown): string {
  const status = apiErrorStatus(error);
  if (status === 403) return d.restoreErrorForbidden;
  if (status === 404) return d.restoreErrorGone;
  if (status === 400 && apiErrorCode(error) === "PRODUCT_CATEGORY_GONE") {
    return d.restoreErrorCategory;
  }
  if (status === 409 && apiErrorCode(error) === "PRODUCT_CATEGORY_BUSY") {
    return d.restoreErrorBusy;
  }
  return d.restoreErrorGeneric;
}
