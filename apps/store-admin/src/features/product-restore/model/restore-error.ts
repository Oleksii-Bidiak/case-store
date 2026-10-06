import { apiErrorStatus } from "@/shared/lib";
import { dict } from "@/shared/config";

const d = dict.products;

/**
 * What a refused `POST /products/:id/restore` means for the operator, for
 * every refusal that is NOT a slot conflict (those open Т10 instead — see
 * `conflictFromCode`). The STATUS decides: these throws carry no code of
 * their own (`api-error-message.ts`).
 *
 * - 403 — no `products:delete` (the button is gated, but the grant can be
 *   revoked while the screen is open);
 * - 404 — no tombstone with this id: somebody restored it first;
 * - 400 — with an empty body the only refusal is `ensureCategoryIsLive`; with
 *   a new slug / артикул it may also be the DTO, which the dialog validates
 *   with the same rules first, so the generic text is honest there.
 *
 * A restore is one write, so every text can say «нічого не змінилося».
 */
export function restoreErrorMessage(
  error: unknown,
  { withOverrides }: { withOverrides: boolean },
): string {
  const status = apiErrorStatus(error);
  if (status === 403) return d.restoreErrorForbidden;
  if (status === 404) return d.restoreErrorGone;
  if (status === 400 && !withOverrides) return d.restoreErrorCategory;
  return d.restoreErrorGeneric;
}
