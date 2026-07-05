import type {
  BannerEntity,
  BannerListResponse,
} from "@/shared/api/generated/models";

/**
 * Server-only, ISR-tagged fetcher for published homepage banners (TASK-186).
 *
 * Mirrors `pages-server.ts`: the Orval hooks talk over Axios, which cannot carry
 * Next.js cache tags (`next: { tags }`), so the homepage reads banners through
 * this tagged `fetch` helper instead. The store-api RevalidationNotifier purges
 * the `banners` tag (and the `/` path) on any admin write that changes banner
 * visibility, so the homepage picks up changes on-demand.
 *
 * Resilient by design: any transport error, unreachable API, or non-OK response
 * yields EMPTY placement groups, so the homepage always renders (each region
 * falls back to its hardcoded content when its group is empty).
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/** Cache tag for the whole published-banners collection. */
export const BANNERS_COLLECTION_TAG = "banners";

/** Placement slot keys — mirror of the API's BannerPlacement enum. */
export type BannerPlacementKey =
  | "HERO_SLIDE"
  | "PROMO_TILE"
  | "PROMO_BANNER"
  | "ANNOUNCEMENT_BAR";

/** Published banners grouped by placement (each group ordered by sortOrder). */
export type BannersByPlacement = Record<BannerPlacementKey, BannerEntity[]>;

/** An all-empty grouping — the resilient default when the API is unavailable. */
function emptyGroups(): BannersByPlacement {
  return {
    HERO_SLIDE: [],
    PROMO_TILE: [],
    PROMO_BANNER: [],
    ANNOUNCEMENT_BAR: [],
  };
}

/**
 * Fetch all PUBLISHED banners and group them by placement, tagged for on-demand
 * revalidation. Never throws — returns all-empty groups on error so the homepage
 * always renders its static fallback content.
 */
export async function fetchPublishedBanners(): Promise<BannersByPlacement> {
  const groups = emptyGroups();

  try {
    const res = await fetch(`${API_BASE_URL}/api/banners`, {
      next: { tags: [BANNERS_COLLECTION_TAG] },
    });
    if (!res.ok) return groups;

    const body = (await res.json()) as BannerListResponse;
    for (const banner of body.data ?? []) {
      const key = banner.placement as BannerPlacementKey;
      if (groups[key]) groups[key].push(banner);
    }
    return groups;
  } catch {
    return groups;
  }
}
