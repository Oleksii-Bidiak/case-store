import type {
  PublicAddonServiceEntity,
  PublicAddonServiceListResponse,
} from "@/shared/api/generated/models";
import { serverFetch } from "@/shared/api/server-fetch";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/**
 * Cache tag for the public add-on list — the store-api `AddonServiceService`
 * purges exactly this string (`ADDON_SERVICES_TAG`) after every catalog write,
 * so a changed price reaches `/info` at once instead of at the next deploy.
 */
export const ADDON_SERVICES_TAG = "addon-services";

/**
 * The add-on services the store currently offers, with their catalog prices
 * (TASK-561). Server-only, tagged `fetch` for the same reason as every sibling
 * here: the Orval client is Axios and cannot carry Next cache tags.
 *
 * `/info` used to advertise three services at prices nobody had entered
 * anywhere; it now lists what an admin can actually attach to a product. Returns
 * an EMPTY list on any failure — the block is marketing, not information a
 * shopper needs to complete an order, so an outage hides it rather than taking
 * the whole support page down. Never a fallback list: a made-up price is the
 * defect this replaced.
 */
export async function fetchActiveAddonServices(): Promise<
  PublicAddonServiceEntity[]
> {
  try {
    const res = await serverFetch(`${API_BASE_URL}/api/addon-services/active`, {
      next: { tags: [ADDON_SERVICES_TAG] },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as PublicAddonServiceListResponse;
    return body.data ?? [];
  } catch {
    return [];
  }
}
