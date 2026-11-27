import type { BulkProductStatusSkipped, PublishBlocker } from "@/shared/api";
import { dict } from "@/shared/config";
import { apiErrorBlockers, apiErrorCode, apiErrorStatus } from "@/shared/lib";

/** How many skipped products a bulk report names before «і ще K». */
const SKIPPED_NAMED = 3;

/**
 * The server's blocker codes as short Ukrainian reasons, comma-joined
 * (TASK-2573) — «немає назви, немає фото». The ONE mapping the publish panel,
 * the row «⋯» «Показати» and the bulk bar all read, so the three never word
 * the same refusal differently.
 */
export function publishBlockerReasons(
  blockers: readonly PublishBlocker[],
): string {
  return blockers
    .map((blocker) => dict.productPublish.blockerReasons[blocker])
    .join(", ");
}

/** «Товар не показано: немає фото» — one product the server refused to show. */
export function productNotShownMessage(
  blockers: readonly PublishBlocker[],
): string {
  return dict.productPublish.notShown(publishBlockerReasons(blockers));
}

/**
 * «Товар не показано: …» for a failed show, when the failure IS the server's
 * readiness refusal — a 400 `PRODUCT_NOT_READY` carrying known blockers.
 * `undefined` for every other failure, so the caller keeps its own copy.
 */
export function productNotReadyMessage(error: unknown): string | undefined {
  if (apiErrorStatus(error) !== 400) return undefined;
  if (apiErrorCode(error) !== "PRODUCT_NOT_READY") return undefined;
  const blockers = apiErrorBlockers(error);
  return blockers ? productNotShownMessage(blockers) : undefined;
}

/**
 * The report for products a bulk show left hidden: up to three named with
 * their reasons, the rest counted («і ще K»).
 */
export function skippedProductsMessage(
  skipped: readonly BulkProductStatusSkipped[],
): string {
  const t = dict.products.bulk;
  const named = skipped
    .slice(0, SKIPPED_NAMED)
    .map((item) =>
      t.skippedItem(item.name, publishBlockerReasons(item.blockers)),
    );
  return t.skippedNotShown(
    skipped.length,
    named.join("; "),
    skipped.length - named.length,
  );
}
