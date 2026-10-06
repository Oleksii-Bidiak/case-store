import { apiErrorCode, apiErrorStatus } from "@/shared/lib";
import { dict } from "@/shared/config";

const d = dict.categories.delete;

/** Which move mode the refused request used — two codes read differently. */
export type DeletionMode = "existing" | "new" | "none";

/**
 * What a refused `DELETE /api/admin/categories/:id` means for the operator
 * (TASK-655, ДН-2.8).
 *
 * The STATUS decides and the code only refines (`api-error-message.ts`): Nest
 * fills `error` with the exception's name for an uncoded throw, so a bare
 * «has a code» proves nothing. The codes are the stable ones from the API's
 * `category.errors.ts` — the strings are pinned there, not here.
 *
 * Every text ends with «Нічого не змінилося»: the delete is ONE transaction
 * (TASK-652), so a refusal really did leave the tree, the products and the
 * carousels as they were — and the dialog keeps the operator's choice.
 */
export function deletionErrorMessage(
  error: unknown,
  { mode, slug }: { mode: DeletionMode; slug: string },
): string {
  const status = apiErrorStatus(error);
  const code = apiErrorCode(error);

  if (status === 403) {
    return mode === "new" ? d.errorForbiddenNew : d.errorForbidden;
  }
  if (status === 400) {
    if (code === "CATEGORY_MOVE_TARGET_IN_SUBTREE") return d.errorInSubtree;
    if (code === "CATEGORY_MOVE_TARGET_REQUIRED") return d.errorTargetRequired;
  }
  if (status === 404) {
    if (code === "CATEGORY_MOVE_TARGET_NOT_FOUND") {
      return mode === "new" ? d.errorParentGone : d.errorTargetGone;
    }
    // An uncoded 404 is the category itself — someone deleted it first.
    return d.goneError;
  }
  if (status === 409) {
    if (code === "CATEGORY_SLUG_CONFLICT") return d.errorSlugConflict(slug);
    if (code === "CATEGORY_TREE_STALE") return d.errorTreeStale;
  }
  return d.errorGeneric;
}

/**
 * Refusals after which the dialog's own numbers may be out of date: the
 * category gained products (REQUIRED) or the tree moved under it. The caller
 * re-reads the preview and the tree — WITHOUT touching the operator's choice.
 */
export function deletionErrorIsStale(error: unknown): boolean {
  const code = apiErrorCode(error);
  return (
    code === "CATEGORY_MOVE_TARGET_REQUIRED" ||
    code === "CATEGORY_MOVE_TARGET_IN_SUBTREE" ||
    code === "CATEGORY_MOVE_TARGET_NOT_FOUND" ||
    code === "CATEGORY_TREE_STALE"
  );
}
