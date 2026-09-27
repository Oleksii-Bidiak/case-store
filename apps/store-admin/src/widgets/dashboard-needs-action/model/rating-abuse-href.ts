import type { RatingAbuseSignalsDto } from "@/shared/api";

/**
 * Where the «Сигнали накрутки оцінок» card leads (TASK-601 UI, row TASK-1004).
 *
 * `ratingAbuse` counts SITUATIONS — a product that collected a burst of ratings
 * in an hour, an address behind a run of 1★ — and the needs-action payload now
 * names them (`ratingAbuseSignals`). When there is exactly ONE situation the
 * card opens the reviews screen filtered to it; anything else (none, several, a
 * mix) opens the unfiltered screen, because one filter cannot show two series
 * and picking one of them would hide the rest.
 *
 * Always `status=all`: the rows behind a burst sit in every moderation queue,
 * and the default `pending` would hide most of them.
 *
 * The href carries an IP address, so the caller renders it only for a session
 * that may moderate reviews — an analytics-only viewer gets the number without
 * the link (the IP must not leak into a URL they can copy; TASK-999 is about
 * whether they should see the list at all).
 */
export function ratingAbuseHref(
  signals: RatingAbuseSignalsDto | undefined,
): string {
  const productIds = signals?.productIds ?? [];
  const createdIps = signals?.createdIps ?? [];

  if (productIds.length === 1 && createdIps.length === 0) {
    return `/reviews?status=all&productId=${encodeURIComponent(productIds[0])}`;
  }
  if (createdIps.length === 1 && productIds.length === 0) {
    return `/reviews?status=all&createdIp=${encodeURIComponent(createdIps[0])}`;
  }
  return "/reviews?status=all";
}
