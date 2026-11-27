import { cookies } from "next/headers";
import {
  CATALOG_DEVICE_COOKIE,
  parseCatalogDeviceCookie,
} from "@/entities/my-devices";
import { COMPAT_OFF, COMPAT_PARAM } from "@/features/product-filters";
import type { ListingParamReader } from "@/widgets/product-list";

/**
 * The «Мої пристрої» default filter this request should be listed by
 * (TASK-2564) — `/products` and `/categories/[slug]` only, both dynamic
 * already (they read `searchParams`). The ISR device hubs and the compat
 * pages never call this: their HTML is cached and stays free of anything
 * personal (SF-CAT-87).
 *
 * Only where the default applies: the URL names no device and does not say
 * `compat=off` — the same rule as `catalogDeviceParam`. The cookie is the
 * browser's mirror of that default; a malformed one is ignored.
 */
export async function readServerCatalogDevice(
  read: ListingParamReader,
): Promise<string | undefined> {
  if (read("device") || read(COMPAT_PARAM) === COMPAT_OFF) return undefined;
  const jar = await cookies();
  return parseCatalogDeviceCookie(jar.get(CATALOG_DEVICE_COOKIE)?.value);
}

/** The page's listing reader with the server's default device filled in. */
export function withServerDevice(
  read: ListingParamReader,
  serverDevice: string | undefined,
): ListingParamReader {
  return serverDevice
    ? (key) => (key === "device" ? serverDevice : read(key))
    : read;
}
