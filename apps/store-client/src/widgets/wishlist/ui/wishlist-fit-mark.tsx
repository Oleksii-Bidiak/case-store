"use client";

import { Ban, Check } from "lucide-react";
import { useMyDevices, useMyDevicesHydrated } from "@/entities/my-devices";
import {
  DeviceFitMark,
  deviceDisplayName,
  deviceShortName,
  hasCompatData,
} from "@/features/device-fit";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { getWishlistDeviceFit } from "../model/wishlist-device-fit";

interface WishlistFitMarkProps {
  /** From the product card (`useWishlistFacets`); `undefined` while it loads. */
  compatibleDeviceModelIds: readonly string[] | undefined;
  /** `wrap` — grid card (two clamped lines); `truncate` — a list row. */
  layout?: "wrap" | "truncate";
  className?: string;
}

/**
 * The fit mark on a wishlist card (TASK-1300, Д3-2 Wishlist §18.5) — shown
 * whether the device switch is on or off; that is what «off» is for.
 *
 * With one saved device (or none) it IS the catalogue's mark (K2,
 * `DeviceFitMark`): «Підходить до iPhone 15» / «Не для iPhone 15», in the
 * same reserved slot. With several it answers for all of them, because the
 * wishlist keeps things for the whole family: «Підходить: iPhone 13 · Мама,
 * Galaxy S24» or «Не для ваших пристроїв». Same pill, same colours — fitting
 * is `success`, not fitting is neutral `muted`, never an alarm colour.
 */
export function WishlistFitMark({
  compatibleDeviceModelIds,
  layout = "wrap",
  className,
}: WishlistFitMarkProps) {
  const hydrated = useMyDevicesHydrated();
  const devices = useMyDevices();

  if (!hydrated || devices.length <= 1) {
    return (
      <DeviceFitMark
        compatibleDeviceModelIds={compatibleDeviceModelIds}
        layout={layout}
        reserveSpace
        className={className}
      />
    );
  }

  if (!hasCompatData(compatibleDeviceModelIds)) return null;
  const fit = getWishlistDeviceFit(compatibleDeviceModelIds, devices);
  if (!fit) return null;

  const fits = fit.verdict === "fits";
  const text = fits
    ? dict.wishlist.fitsDevices(
        fit.devices
          .map((device) =>
            deviceDisplayName({
              name: deviceShortName(device.name),
              label: device.label,
            }),
          )
          .join(", "),
      )
    : dict.wishlist.fitsNone;
  const Icon = fits ? Check : Ban;
  const wrap = layout === "wrap";

  // The slot box of `DeviceFitMark` (two 15px lines + padding for `wrap`,
  // one line for `truncate`), so a card's height does not depend on how
  // many devices are saved.
  return (
    <span
      data-slot="device-fit-slot"
      className={cn(
        "flex flex-col justify-end",
        wrap ? "h-9.5" : "h-6",
        className,
      )}
    >
      <span
        data-slot="device-fit-mark"
        data-verdict={fit.verdict}
        title={text}
        className={cn(
          "inline-flex min-h-6 max-w-full gap-1.5 self-start py-1 pr-2.5 pl-2 text-xs leading-tight font-semibold",
          wrap ? "items-start rounded-menu" : "items-center rounded-full",
          fits
            ? "bg-success/14 text-success"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon
          aria-hidden="true"
          strokeWidth={fits ? 2.5 : 2}
          className={cn("size-3.5 shrink-0", wrap && "mt-px")}
        />
        <span className={wrap ? "line-clamp-2 min-w-0" : "truncate"}>
          {text}
        </span>
      </span>
    </span>
  );
}
