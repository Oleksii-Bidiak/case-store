"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useActiveDevice, useMyDevicesHydrated } from "@/entities/my-devices";
import type { ProductGroupEntity } from "@/entities/product";
import { findVariantFor } from "./model-variants";

/**
 * Groups already opened in this tab. The pre-selection runs on the FIRST
 * visit to a group only, so any later position of it is an explicit choice
 * (a model chip, «Обрати варіант для …», «Варіант для нього») and wins.
 */
const visitedGroups = new Set<string>();

/** Test seam: forget the visited groups. */
export function resetPreselectedGroups(): void {
  visitedGroups.clear();
}

/**
 * Rule 7 of the Product mockup: opening a product with an active device that
 * has a variant of it pre-selects that variant. Client-only — the server and
 * the hydration render show the position the URL names, and the swap happens
 * after the device store hydrates (`router.replace`, no history entry, no
 * scroll). Skipped when the current position already fits the device.
 */
export function usePreselectDeviceVariant({
  group,
  currentAttributes,
  currentSlug,
  compatibleDeviceModelIds,
}: {
  group: ProductGroupEntity | null | undefined;
  currentAttributes: Record<string, unknown> | null | undefined;
  currentSlug: string;
  compatibleDeviceModelIds: readonly string[];
}): void {
  const router = useRouter();
  const hydrated = useMyDevicesHydrated();
  const device = useActiveDevice();
  const groupId = group?.id;

  useEffect(() => {
    if (!hydrated || !group || !groupId) return;
    if (visitedGroups.has(groupId)) return;
    visitedGroups.add(groupId);
    if (!device || compatibleDeviceModelIds.includes(device.modelId)) return;
    const variant = findVariantFor(group, currentAttributes, device);
    if (variant && variant.slug !== currentSlug) {
      router.replace(`/products/${variant.slug}`, { scroll: false });
    }
    // Runs once per group: the first hydrated render decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, groupId]);
}
