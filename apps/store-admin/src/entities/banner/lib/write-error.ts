import { apiErrorCode, apiErrorStatus } from "@/shared/lib";
import { dict } from "@/shared/config";

/**
 * What a refused banner write (create, update, publish, duplicate, move) says
 * to the operator, or `undefined` when the refusal is not one the admin words
 * itself — the caller then shows its own generic toast.
 *
 * - 409 `BANNER_PROMO_TILE_LIMIT` (TASK-2013) — the write would make a sixth
 *   PROMO_TILE banner published or scheduled. The storefront has five slots;
 *   «Не вдалося зберегти» would hide both the rule and the way out.
 *
 * The STATUS decides, the code refines (`api-error-message.ts`).
 */
export function bannerWriteErrorMessage(error: unknown): string | undefined {
  if (
    apiErrorStatus(error) === 409 &&
    apiErrorCode(error) === "BANNER_PROMO_TILE_LIMIT"
  ) {
    return dict.banners.errorPromoTileLimit;
  }
  return undefined;
}
