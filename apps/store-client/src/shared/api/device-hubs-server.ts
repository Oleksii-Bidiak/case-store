import type {
  DeviceHubEntity,
  DeviceHubResponse,
  DeviceModelListItemEntity,
  DeviceModelListResponse,
} from "@/shared/api/generated/models";
import { serverFetch, type ServerFetchInit } from "@/shared/api/server-fetch";

/**
 * Server-only, ISR-tagged reads for the model hub `/devices/<модель>`
 * («Все для iPhone 15 Pro», TASK-1954).
 *
 * Why a tagged `fetch` and not the Orval axios client: the hub page is ISR and
 * bakes the model's products — prices, stock — into its HTML. Axios bypasses
 * Next's Data Cache, so no admin write could ever reach a hub before its timer.
 * store-api purges the `device-hubs` tag on every catalogue write and every
 * device model/brand write (`apps/store-api/src/publishing/revalidate-targets.ts`,
 * `DEVICE_HUBS_TAG`), and that purge only lands if the page reads through a
 * fetch carrying this exact tag (TASK-2101). Keep the two strings equal.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/** Cache tag of the hub reads — must equal store-api's `DEVICE_HUBS_TAG`. */
export const DEVICE_HUBS_TAG = "device-hubs";

/**
 * Time floor of a hub read, in seconds — the same hour as the page's own
 * `revalidate`. Bounds what the tag cannot reach: stock moved by orders, which
 * purges nothing (TASK-2103).
 */
export const DEVICE_HUB_REVALIDATE_SECONDS = 3600;

function hubReadInit(): ServerFetchInit {
  return {
    next: {
      tags: [DEVICE_HUBS_TAG],
      revalidate: DEVICE_HUB_REVALIDATE_SECONDS,
    },
  };
}

/** How many models one series lookup asks for — a series is a handful. */
const SERIES_LOOKUP_LIMIT = 50;

/**
 * The hub of one device model, or `null` when there is none (an unknown or
 * inactive model, or one without a single visible compatible product — the
 * API's 404 is the verdict).
 *
 * Anything other than a 404 THROWS: an outage must render the error boundary
 * (and let ISR keep serving the last good copy), never pass for a missing page
 * and de-index the hub behind a 404.
 */
export async function fetchDeviceHub(
  deviceSlug: string,
): Promise<DeviceHubEntity | null> {
  const res = await serverFetch(
    `${API_BASE_URL}/api/catalog/device-hubs/${encodeURIComponent(deviceSlug)}`,
    hubReadInit(),
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Device hub read failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as DeviceHubResponse;
  if (!body?.data) {
    throw new Error("Device hub read returned no data");
  }
  return body.data;
}

/**
 * The other models of a series that have a hub of their own — for «Інші
 * моделі iPhone 15». Popular first, the current model excluded, only models
 * with ≥ 1 visible compatible product (a link to a model without one would be
 * a link to a 404), at most `limit`.
 *
 * `GET /device-models` has no series filter, so this searches by the series
 * text (every model of «iPhone 15» has it in its name) and keeps the exact
 * series matches. Decorative: never throws, `[]` on any failure.
 */
export async function fetchSeriesSiblings(
  model: { id: string; series: string | null },
  limit = 5,
): Promise<DeviceModelListItemEntity[]> {
  const series = model.series?.trim();
  if (!series) return [];
  try {
    const params = new URLSearchParams({
      search: series,
      sort: "popular",
      limit: String(SERIES_LOOKUP_LIMIT),
    });
    const res = await serverFetch(
      `${API_BASE_URL}/api/device-models?${params.toString()}`,
      hubReadInit(),
    );
    if (!res.ok) return [];
    const body = (await res.json()) as DeviceModelListResponse;
    return (body?.data ?? [])
      .filter(
        (sibling) =>
          sibling.id !== model.id &&
          sibling.series?.trim() === series &&
          sibling.productCount > 0,
      )
      .slice(0, limit);
  } catch {
    return [];
  }
}
