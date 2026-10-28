import type {
  PublicHomeBlockEntity,
  PublicHomeBlockListResponse,
} from "@/shared/api/generated/models";
import { serverFetch, type ServerFetchInit } from "@/shared/api/server-fetch";

/**
 * Server-only, ISR-tagged fetcher for the homepage blocks (TASK-660/661/663).
 *
 * Mirrors `banners-server.ts`: the Orval hooks talk over Axios, which cannot
 * carry Next.js cache tags (`next: { tags }`), so the homepage reads through
 * this tagged `fetch` helper instead. The store-api RevalidationNotifier purges
 * `home-blocks` and `carousels` (and the `/` path) on any admin write to a block
 * or a carousel, so the homepage picks up changes on demand.
 *
 * Resilient by design: any transport error, unreachable API, or non-OK
 * response yields an EMPTY list — the homepage then renders its built-in default
 * order (`app/home-blocks.tsx`), so it always renders.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/** Cache tag of the homepage block list (TASK-660). */
export const HOME_BLOCKS_TAG = "home-blocks";

/** Cache tag of carousel-derived data (purged by every carousel write). */
export const CAROUSELS_COLLECTION_TAG = "carousels";

/**
 * Fetch the visible homepage blocks, in page order, with their carousels and
 * tabs resolved — ONE request for the whole page (the API resolves the products
 * of every CAROUSEL / TABS block in the same response). Never throws — returns
 * `[]` on any error.
 *
 * `init` is spread over the default request. It exists as the seam for the
 * signed homepage preview (TASK-669), which must send its token header and
 * replace the ISR tags with `no-store`; called without it, this stays the
 * tagged, cached public read.
 */
export async function fetchHomeBlocks(
  init: ServerFetchInit = {},
): Promise<PublicHomeBlockEntity[]> {
  try {
    const res = await serverFetch(`${API_BASE_URL}/api/home-blocks`, {
      next: { tags: [HOME_BLOCKS_TAG, CAROUSELS_COLLECTION_TAG] },
      ...init,
    });
    if (!res.ok) return [];

    const body = (await res.json()) as PublicHomeBlockListResponse;
    return body.data ?? [];
  } catch {
    return [];
  }
}
