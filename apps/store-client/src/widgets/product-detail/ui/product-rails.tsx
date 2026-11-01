"use client";

import { getDeviceFamilyTone } from "@/entities/device";
import { useActiveDevice, useMyDevicesHydrated } from "@/entities/my-devices";
import { deviceHubHref, deviceShortName } from "@/features/device-fit";
import type { ProductCompatibleDeviceEntity } from "@/shared/api/generated/models";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

import { ProductRail } from "./product-rail";

/**
 * The PDP's two rails (Product mockup §6.9).
 *
 * 1. The device rail. With an active device: «Для вашого пристрою» (or «Для
 *    пристрою · Мама»), «Ще для iPhone 15 Pro», «Все для iPhone 15 Pro →» —
 *    in-stock products for THAT device, whatever this product fits. Without
 *    one: «Часто беруть разом», «До цього товару беруть», by the product's
 *    first compatible model (the rail the server prefetches). The device is
 *    client-only, so the server and hydration renders show the neutral rail
 *    and the device rail replaces it after hydration — cached HTML stays
 *    impersonal.
 * 2. The category rail: «Ще з категорії «…»», «Усі в категорії».
 *
 * Cards in both carry the mode-A fit mark (`ProductCardActions`).
 */
export function ProductRails({
  productId,
  compatibleModels,
  category,
}: {
  productId: string;
  compatibleModels: readonly ProductCompatibleDeviceEntity[] | null | undefined;
  category: { id: string; name: string; slug: string };
}) {
  const hydrated = useMyDevicesHydrated();
  const active = useActiveDevice();
  const device = hydrated ? active : null;
  const firstModel = compatibleModels?.[0] ?? null;
  const copy = dict.deviceFit.rail;

  let deviceRail = null;
  if (device) {
    const short = deviceShortName(device.name);
    deviceRail = (
      <ProductRail
        key={`device-${device.modelId}`}
        headingId="device-rail-heading"
        kicker={
          <>
            <span
              aria-hidden="true"
              className={cn(
                "size-2 shrink-0 rounded-full",
                getDeviceFamilyTone(device.family).strong,
              )}
            />
            {device.label ? copy.kickerLabelled(device.label) : copy.kickerMine}
          </>
        }
        title={copy.titleMine(device.name)}
        more={{ href: deviceHubHref(device.slug), label: copy.allFor(short) }}
        filter={{ deviceModelId: device.modelId }}
        excludeId={productId}
      />
    );
  } else if (firstModel) {
    deviceRail = (
      <ProductRail
        key={`model-${firstModel.id}`}
        headingId="device-rail-heading"
        kicker={copy.kickerNone}
        title={copy.titleNone}
        more={{ href: deviceHubHref(firstModel.slug), label: copy.seeAll }}
        filter={{ deviceModelId: firstModel.id }}
        excludeId={productId}
      />
    );
  }

  return (
    <>
      {deviceRail}
      <ProductRail
        headingId="category-rail-heading"
        title={copy.categoryTitle(category.name)}
        more={{
          href: `/categories/${category.slug}`,
          label: copy.categoryLink,
        }}
        filter={{ categoryId: category.id }}
        excludeId={productId}
      />
    </>
  );
}
