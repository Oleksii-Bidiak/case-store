import type {
  PublicCarouselEntity,
  PublicCarouselListResponse,
} from "@/shared/api/generated/models";

/**
 * Server-only, ISR-tagged fetcher for published recommendation carousels
 * (TASK-139).
 *
 * Mirrors `banners-server.ts`: the Orval hooks talk over Axios, which cannot
 * carry Next.js cache tags (`next: { tags }`), so the homepage reads carousels
 * through this tagged `fetch` helper instead. The store-api
 * RevalidationNotifier purges the `carousels` tag (and the `/` path) on any
 * admin write that changes carousel visibility, so the homepage picks up
 * changes on-demand.
 *
 * Resilient by design: any transport error, unreachable API, or non-OK
 * response yields an EMPTY list — the RecommendationCarousels widget renders
 * nothing for an empty list, so the homepage always renders.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/** Cache tag for the whole published-carousels collection. */
export const CAROUSELS_COLLECTION_TAG = "carousels";

/**
 * Fetch all PUBLISHED carousels with their resolved product lists, tagged for
 * on-demand revalidation. Never throws — returns `[]` on any error. Empty
 * `products` arrays are the backend's honest answer (§Empty-carousel behavior,
 * plan 154); hiding those sections is the widget's job, not this helper's.
 */
export async function fetchPublishedCarousels(): Promise<
  PublicCarouselEntity[]
> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/carousels`, {
      next: { tags: [CAROUSELS_COLLECTION_TAG] },
    });
    if (!res.ok) return [];

    const body = (await res.json()) as PublicCarouselListResponse;
    return body.data ?? [];
  } catch {
    return [];
  }
}
