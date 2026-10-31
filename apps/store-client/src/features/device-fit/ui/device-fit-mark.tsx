"use client";

import type { ReactNode } from "react";
import { Ban, Check } from "lucide-react";

import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

import type { MyDevice } from "@/entities/my-devices";

import {
  deviceShortDisplayName,
  deviceShortName,
  fittingDevices,
  hasCompatData,
  type DeviceFitVerdict,
} from "../model/device-fit";
import { useDeviceFitScope } from "../model/fit-scope";
import { useDeviceFit } from "../model/use-device-fit";

interface MarkAnswer {
  fits: boolean;
  text: string;
}

/** Mode A: the active device only, by its short name (no label on cards). */
function modeAAnswer(verdict: DeviceFitVerdict, device: MyDevice): MarkAnswer {
  const fits = verdict === "fits";
  const name = deviceShortName(device.name);
  return {
    fits,
    text: fits ? dict.deviceFit.fits(name) : dict.deviceFit.notFor(name),
  };
}

/** Mode B: every saved device the product fits, each with its label. */
function modeBAnswer(
  ids: readonly string[] | null | undefined,
  devices: readonly MyDevice[],
): MarkAnswer | null {
  const fitting = fittingDevices(ids, devices);
  if (!fitting) return null;
  return fitting.length > 0
    ? {
        fits: true,
        text: dict.deviceFit.fitsAny(fitting.map(deviceShortDisplayName)),
      }
    : { fits: false, text: dict.deviceFit.notForAny };
}

export interface DeviceFitMarkProps {
  /** `product.compatibleDeviceModelIds` straight from the API. */
  compatibleDeviceModelIds: readonly string[] | null | undefined;
  /**
   * `wrap` — grid and rail cards (~170px wide on a phone): the text wraps
   * inside a rounded box, clamped to two lines. `truncate` — a wide list row:
   * one line, ellipsis. Either way the full text is in `title`.
   */
  layout?: "wrap" | "truncate";
  /**
   * Hold a fixed-height slot — two lines for `wrap`, one for `truncate` — on
   * a product that HAS compatibility data, whether or not a mark shows in it
   * (server render, hydration, no saved device, any verdict). The mark can
   * never outgrow the slot, so it appears without shifting the card. Products
   * without compatibility data never reserve anything: they never get a mark.
   */
  reserveSpace?: boolean;
  className?: string;
}

/**
 * «Підходить до iPhone 15 Pro» / «Не для iPhone 15 Pro» — the shopper's
 * active device against the product's compatible models (TASK-1953).
 *
 * Renders no verdict on the server, none until the device store hydrates,
 * none without a saved device and nothing at all for a product with no
 * compatibility data. Fitting is `success`; not fitting is neutral `muted`,
 * never an alarm colour. Not interactive — the text is the accessible name,
 * the icon is decorative. Cards use the short model name (mockup `short`).
 *
 * Inside a `DeviceFitScopeProvider scope="all"` (the catalogue's «для всіх
 * моїх» filter) with ≥ 2 saved devices, the mark answers for all of them:
 * «Підходить: iPhone 15 Pro, iPhone 13 · Мама» / «Не для ваших пристроїв».
 */
export function DeviceFitMark({
  compatibleDeviceModelIds,
  layout = "wrap",
  reserveSpace = false,
  className,
}: DeviceFitMarkProps) {
  const { device, devices, verdict } = useDeviceFit(compatibleDeviceModelIds);
  const scope = useDeviceFitScope();
  const wrap = layout === "wrap";

  // Mode B only with ≥ 2 saved devices — with one it reads exactly like A.
  const modeB = scope === "all" && devices.length >= 2;
  const answer = modeB
    ? modeBAnswer(compatibleDeviceModelIds, devices)
    : verdict && device
      ? modeAAnswer(verdict, device)
      : null;

  let mark: ReactNode = null;
  if (answer) {
    const { fits, text } = answer;
    const Icon = fits ? Check : Ban;
    mark = (
      <span
        data-slot="device-fit-mark"
        data-verdict={fits ? "fits" : "no-fit"}
        data-mode={modeB ? "all" : "active"}
        title={text}
        className={cn(
          "inline-flex min-h-6 max-w-full gap-1.5 self-start py-1 pr-2.5 pl-2 text-xs leading-tight font-semibold",
          wrap ? "items-start rounded-menu" : "items-center rounded-full",
          fits
            ? "bg-success/14 text-success"
            : "bg-muted text-muted-foreground",
          !reserveSpace && className,
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
    );
  }

  if (!reserveSpace || !hasCompatData(compatibleDeviceModelIds)) return mark;

  // The slot is the same element before and after hydration — only its child
  // changes. `h-9.5` = two 15px lines + the mark's 8px of padding, the most a
  // clamped mark can take. A one-line mark sits at the bottom, next to the
  // stock line it reads with; the spare space goes above it.
  return (
    <span
      data-slot="device-fit-slot"
      aria-hidden={mark ? undefined : true}
      className={cn(
        "flex flex-col justify-end",
        wrap ? "h-9.5" : "h-6",
        className,
      )}
    >
      {mark}
    </span>
  );
}
