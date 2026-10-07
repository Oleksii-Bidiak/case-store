import type {
  PublicCarouselEntity,
  PublicHomeBlockEntity,
  PublicHomeBlockListResponse,
} from "@/shared/api/generated/models";
import { serverFetch } from "@/shared/api/server-fetch";

/**
 * Server-only, ISR-tagged fetcher for the homepage blocks (TASK-660/661) — and,
 * derived from them, the carousel groups the current `page.tsx` renders.
 *
 * Mirrors `banners-server.ts`: the Orval hooks talk over Axios, which cannot
 * carry Next.js cache tags (`next: { tags }`), so the homepage reads through
 * this tagged `fetch` helper instead. The store-api RevalidationNotifier purges
 * `home-blocks` and `carousels` (and the `/` path) on any admin write to a block
 * or a carousel, so the homepage picks up changes on demand.
 *
 * Resilient by design: any transport error, unreachable API, or non-OK
 * response yields an EMPTY list — the widgets render their fallbacks for empty
 * groups, so the homepage always renders.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/** Cache tag of the homepage block list (TASK-660). */
export const HOME_BLOCKS_TAG = "home-blocks";

/** Cache tag of carousel-derived data (purged by every carousel write). */
export const CAROUSELS_COLLECTION_TAG = "carousels";

/**
 * The two carousel groups today's `page.tsx` renders: the «Популярне» tab rail
 * and the standalone rails below it. Since TASK-660 these are no longer a
 * property of the carousel (`Carousel.placement` is gone) — they are derived from
 * the homepage blocks. Plan 186's TASK-663 replaces this bridge by rendering the
 * blocks themselves.
 */
export type CarouselPlacementKey = "HOME_TABS" | "HOME_RAILS";

/** Carousel groups derived from the homepage blocks (each in display order). */
export type CarouselsByPlacement = Record<
  CarouselPlacementKey,
  PublicCarouselEntity[]
>;

/**
 * Fetch the visible homepage blocks, in page order, with their carousels and tabs
 * resolved. Never throws — returns `[]` on any error.
 */
export async function fetchHomeBlocks(): Promise<PublicHomeBlockEntity[]> {
  try {
    const res = await serverFetch(`${API_BASE_URL}/api/home-blocks`, {
      next: { tags: [HOME_BLOCKS_TAG, CAROUSELS_COLLECTION_TAG] },
    });
    if (!res.ok) return [];

    const body = (await res.json()) as PublicHomeBlockListResponse;
    return body.data ?? [];
  } catch {
    return [];
  }
}

/**
 * The carousel groups of the current page, from the homepage blocks (compile
 * bridge of plan 186 — `page.tsx` is unchanged until TASK-663):
 *
 *   - HOME_TABS  ← the visible tabs of the FIRST `TABS` block (empty when it has
 *                  none — PopularRail then shows its query-driven fallback tabs,
 *                  exactly as before);
 *   - HOME_RAILS ← the carousel of every `CAROUSEL` block, in block order.
 *
 * Empty `products` arrays are the backend's honest answer (§Empty-carousel
 * behavior, plan 154); hiding those sections is the widget's job.
 */
export async function fetchPublishedCarouselsByPlacement(): Promise<CarouselsByPlacement> {
  const groups: CarouselsByPlacement = { HOME_TABS: [], HOME_RAILS: [] };
  let tabsTaken = false;

  for (const block of await fetchHomeBlocks()) {
    if (block.type === "TABS" && !tabsTaken) {
      groups.HOME_TABS.push(...(block.tabs ?? []));
      tabsTaken = true;
    } else if (block.type === "CAROUSEL" && block.carousel) {
      groups.HOME_RAILS.push(block.carousel);
    }
  }

  return groups;
}
