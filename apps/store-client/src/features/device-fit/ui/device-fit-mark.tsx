"use client";

import { Ban, Check } from "lucide-react";

import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

import { hasCompatData } from "../model/device-fit";
import { useDeviceFit } from "../model/use-device-fit";

export interface DeviceFitMarkProps {
  /** `product.compatibleDeviceModelIds` straight from the API. */
  compatibleDeviceModelIds: readonly string[] | null | undefined;
  /**
   * `wrap` — grid and rail cards (~170px wide on a phone): the text breaks
   * onto several lines inside a rounded box. `truncate` — a wide list row: one
   * line, ellipsis, the full text in `title`.
   */
  layout?: "wrap" | "truncate";
  /**
   * Keep a one-line slot while there is no verdict (server render, hydration,
   * no saved device) on a product that HAS compatibility data — so the mark
   * appears without shifting the card. Products without compatibility data
   * never reserve anything: they never get a mark.
   */
  reserveSpace?: boolean;
  className?: string;
}

/**
 * «Підходить до iPhone 15 Pro» / «Не для iPhone 15 Pro» — the shopper's
 * active device against the product's compatible models (TASK-1953).
 *
 * Renders nothing on the server, nothing until the device store hydrates,
 * nothing without a saved device and nothing for a product with no
 * compatibility data. Fitting is `success`; not fitting is neutral `muted`,
 * never an alarm colour. Not interactive — the text is the accessible name,
 * the icon is decorative.
 */
export function DeviceFitMark({
  compatibleDeviceModelIds,
  layout = "wrap",
  reserveSpace = false,
  className,
}: DeviceFitMarkProps) {
  const { device, verdict } = useDeviceFit(compatibleDeviceModelIds);

  if (!verdict || !device) {
    return reserveSpace && hasCompatData(compatibleDeviceModelIds) ? (
      <span
        aria-hidden="true"
        data-slot="device-fit-placeholder"
        className={cn("block h-6", className)}
      />
    ) : null;
  }

  const fits = verdict === "fits";
  const text = fits
    ? dict.deviceFit.fits(device.name)
    : dict.deviceFit.notFor(device.name);
  const Icon = fits ? Check : Ban;
  const wrap = layout === "wrap";

  return (
    <span
      data-slot="device-fit-mark"
      data-verdict={verdict}
      title={text}
      className={cn(
        "inline-flex min-h-6 max-w-full gap-1.5 self-start py-1 pr-2.5 pl-2 text-xs leading-tight font-semibold",
        wrap ? "items-start rounded-menu" : "items-center rounded-full",
        fits ? "bg-success/14 text-success" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        strokeWidth={fits ? 2.5 : 2}
        className={cn("size-3.5 shrink-0", wrap && "mt-px")}
      />
      <span className={wrap ? "min-w-0" : "truncate"}>{text}</span>
    </span>
  );
}
