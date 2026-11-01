import {
  useAdminBannerControllerFindAll,
  type BannerEntity,
} from "@/entities/banner";
import type { BannerPlacementValue, BannerStatusValue } from "./banner-schema";

/**
 * The storefront's promo-tile slots (TASK-2013): two beside the hero slider,
 * three in a row beneath it. Mirrors store-api `MAX_ACTIVE_PROMO_TILES` — the
 * API refuses a sixth with 409 `BANNER_PROMO_TILE_LIMIT`; this copy only words
 * the rule before the operator hits it.
 */
export const MAX_PROMO_TILES = 5;

/** Tiles 1–2 stand beside the slider; 3–5 go to the row under it. */
export const PROMO_TILES_BESIDE = 2;

/** Statuses that hold a slot — the API's rule: a draft holds none. */
const ACTIVE: readonly BannerStatusValue[] = ["PUBLISHED", "SCHEDULED"];

const holdsSlot = (placement: string, status: string) =>
  placement === "PROMO_TILE" && (ACTIVE as readonly string[]).includes(status);

export interface PromoTileSlots {
  /** Slots held after this save, the edited banner included when it holds one. */
  used: number;
  max: number;
  /** The form's values would put this banner in a slot. */
  occupies: boolean;
  /**
   * The save would be refused: this banner would START holding a slot (it does
   * not hold one already) while the other banners hold all of them. A banner
   * that already holds a slot keeps it on every re-save, as in the API.
   */
  full: boolean;
  /** 1-based storefront position this banner takes (when it occupies). */
  position?: number;
}

/**
 * Pure slot arithmetic over the admin banner list (any placements; ordered by
 * placement, then `sortOrder` — the storefront's order). `bannerId` is the
 * banner being edited (absent on create); `placement` / `status` are the form's
 * current values, so the counter follows the operator's choices live.
 */
export function promoTileSlots({
  banners,
  bannerId,
  placement,
  status,
}: {
  banners: readonly BannerEntity[];
  bannerId?: string;
  placement: BannerPlacementValue;
  status: BannerStatusValue;
}): PromoTileSlots {
  const active = banners.filter((b) => holdsSlot(b.placement, b.status));
  const others = active.filter((b) => b.id !== bannerId);
  const stored = bannerId ? banners.find((b) => b.id === bannerId) : undefined;
  const alreadyHolds = stored
    ? holdsSlot(stored.placement, stored.status)
    : false;
  const occupies = holdsSlot(placement, status);
  const full = occupies && !alreadyHolds && others.length >= MAX_PROMO_TILES;

  let position: number | undefined;
  if (occupies && !full) {
    // A tile that already holds a slot keeps its place; one that starts
    // holding one is appended (the API appends to the bucket on create/move).
    const own = active.findIndex((b) => b.id === bannerId);
    position = alreadyHolds && own >= 0 ? own + 1 : others.length + 1;
  }

  return {
    // Rows from before the rule can exceed the max — shown as is («6 з 5»).
    used: others.length + (occupies && !full ? 1 : 0),
    max: MAX_PROMO_TILES,
    occupies,
    full,
    position,
  };
}

/**
 * The slot counter of the banner form, fed by the complete PROMO_TILE list.
 * `undefined` until the list arrives (or when it cannot be read) — the form
 * then simply shows no counter; the API still enforces the limit.
 */
export function usePromoTileSlots(args: {
  bannerId?: string;
  placement: BannerPlacementValue;
  status: BannerStatusValue;
}): PromoTileSlots | undefined {
  const { data } = useAdminBannerControllerFindAll({ placement: "PROMO_TILE" });
  if (!data) return undefined;
  return promoTileSlots({ banners: data.data, ...args });
}
