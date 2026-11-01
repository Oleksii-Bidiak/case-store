import { ConflictException } from '@nestjs/common';
import { BannerPlacement, PublishStatus } from '@prisma/client';

/**
 * Stable, machine-readable error codes for banner writes the admin panel has to tell
 * apart (TASK-2013).
 *
 * These travel to the client in the HTTP error envelope's `error` field (see
 * {@link HttpExceptionFilter}, which surfaces ONLY `resp.error` and `resp.message` — any
 * extra property on the thrown body is silently discarded). The admin panel words the
 * code itself in Ukrainian; keep the string values stable.
 */
export const BannerErrorCode = {
  /**
   * The write would put a SIXTH active banner into the PROMO_TILE placement — a 409.
   * Nothing was written; the operator has to take another tile down (or leave this one
   * a draft) first.
   */
  PROMO_TILE_LIMIT: 'BANNER_PROMO_TILE_LIMIT',
} as const;

export type BannerErrorCode = (typeof BannerErrorCode)[keyof typeof BannerErrorCode];

/**
 * How many PROMO_TILE banners may be active at once (TASK-2013). The storefront lays them
 * out as two tiles beside the hero slider and three in a row beneath it — a sixth has no
 * slot, so it would either vanish or break the grid.
 */
export const MAX_ACTIVE_PROMO_TILES = 5;

/**
 * Statuses that OCCUPY a promo-tile slot. SCHEDULED counts as well as PUBLISHED: the
 * publishing scheduler flips a due SCHEDULED banner live on its own tick, with no check
 * of its own, so letting a sixth one be scheduled would only move the overflow to a
 * moment nobody is watching. DRAFT holds no slot.
 */
export const ACTIVE_BANNER_STATUSES: readonly PublishStatus[] = [
  PublishStatus.PUBLISHED,
  PublishStatus.SCHEDULED,
];

/** Whether a banner in `placement` with `status` takes one of the limited promo slots. */
export function occupiesPromoTileSlot(placement: BannerPlacement, status: PublishStatus): boolean {
  return placement === BannerPlacement.PROMO_TILE && ACTIVE_BANNER_STATUSES.includes(status);
}

/**
 * The 409 for a write that would exceed {@link MAX_ACTIVE_PROMO_TILES}. Built as
 * `{ error, message }` like every other coded failure, so the code reaches the wire.
 */
export function promoTileLimitException(): ConflictException {
  return new ConflictException({
    error: BannerErrorCode.PROMO_TILE_LIMIT,
    message: `At most ${MAX_ACTIVE_PROMO_TILES} promo tiles can be published or scheduled at once`,
  });
}
