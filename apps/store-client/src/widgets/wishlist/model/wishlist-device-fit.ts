import type { MyDevice } from "@/entities/my-devices";

/**
 * Which of the shopper's saved devices a saved product fits — the wishlist's
 * reading of the fit mark (Д3-2 Wishlist mockup §18.5).
 *
 * The catalogue card answers for the ACTIVE device only. The wishlist holds
 * things for the whole family, so with several saved devices its card names
 * every device the product fits («Підходить: iPhone 13 · Мама, Galaxy S24»)
 * or says it fits none of them. With one device it is the catalogue's answer.
 *
 * - `null` — no mark: no saved device, or the product carries no
 *   compatibility data (headphones, a power bank) — never a guessed «не для».
 * - `fits` — the devices it fits, in the saved order (most recent first).
 * - `no-fit` — it fits none of the saved devices.
 */
export type WishlistDeviceFit =
  { verdict: "fits"; devices: readonly MyDevice[] } | { verdict: "no-fit" };

export function getWishlistDeviceFit(
  compatibleDeviceModelIds: readonly string[] | null | undefined,
  devices: readonly MyDevice[],
): WishlistDeviceFit | null {
  if (devices.length === 0 || !compatibleDeviceModelIds?.length) return null;
  const fitting = devices.filter((device) =>
    compatibleDeviceModelIds.includes(device.modelId),
  );
  return fitting.length > 0
    ? { verdict: "fits", devices: fitting }
    : { verdict: "no-fit" };
}
