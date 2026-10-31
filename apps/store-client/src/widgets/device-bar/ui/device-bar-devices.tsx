"use client";

import Link from "next/link";
import { ChevronRight, Plus, Smartphone } from "lucide-react";

import {
  getDeviceFamilyHoverSurface,
  getDeviceFamilyTone,
} from "@/entities/device";
import type { MyDevice } from "@/entities/my-devices";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

import { BAR_PILL, FOCUS_RING, PRIMARY_CONTROL_ATTR } from "./bar-styles";
import { DeviceChip } from "./device-chip";

const t = dict.devicePicker.bar;

/** Idle pills shown beside the active chip from 1024 (the two most recent). */
export const IDLE_DEVICE_COUNT = 2;

interface DeviceBarDevicesProps {
  devices: readonly MyDevice[];
  onOpenPicker: () => void;
  onActivate: (modelId: string) => void;
  onForget: (device: MyDevice) => void;
}

/**
 * Tier 1 of the device bar: the shopper's devices. No device → one dashed
 * «Оберіть свій пристрій» button. With devices → the active chip, then (from
 * 1024) the two most recent idle pills, «ще N» for the rest and «Мої
 * пристрої ›» at the far right; «+» at every width. Nothing scrolls: below
 * 1024 the chip alone stretches across the row and counts the others itself.
 */
export function DeviceBarDevices({
  devices,
  onOpenPicker,
  onActivate,
  onForget,
}: DeviceBarDevicesProps) {
  const active = devices[0];

  if (!active) {
    return (
      <button
        type="button"
        {...{ [PRIMARY_CONTROL_ATTR]: "" }}
        aria-haspopup="dialog"
        onClick={onOpenPicker}
        className={cn(
          "inline-flex h-11 w-full max-w-full min-w-0 items-center gap-2 rounded-full border-chip border-dashed border-border bg-card px-3.5 text-sm font-semibold text-foreground transition-colors hover:border-solid min-[480px]:w-auto",
          FOCUS_RING,
        )}
      >
        <Smartphone aria-hidden="true" className="size-4.5 shrink-0" />
        <span className="whitespace-nowrap">{t.pick}</span>
        <span className="hidden min-w-0 truncate font-normal text-muted-foreground min-[480px]:inline">
          {t.pickHint}
        </span>
      </button>
    );
  }

  const idle = devices.slice(1, 1 + IDLE_DEVICE_COUNT);
  const overflow = devices.length - 1 - idle.length;

  return (
    <>
      <div
        role="group"
        aria-label={t.groupAria}
        className="flex min-w-0 flex-1 items-center gap-1.5 lg:flex-initial"
      >
        <DeviceChip
          device={active}
          savedCount={devices.length}
          onChange={onOpenPicker}
          onForget={() => onForget(active)}
        />

        {idle.map((device) => {
          const tone = getDeviceFamilyTone(device.family);
          return (
            <button
              key={device.modelId}
              type="button"
              aria-label={t.showForAria(device.name, device.label)}
              onClick={() => onActivate(device.modelId)}
              className={cn(
                BAR_PILL,
                "hidden max-w-60 pr-3.5 pl-3 hover:border-transparent lg:inline-flex",
                getDeviceFamilyHoverSurface(device.family),
                FOCUS_RING,
              )}
            >
              <span
                aria-hidden="true"
                className={cn("size-2.5 shrink-0 rounded-full", tone.strong)}
              />
              <span className="min-w-0 truncate">
                {device.label
                  ? `${device.name}${dict.devicePicker.metaSeparator}${device.label}`
                  : device.name}
              </span>
            </button>
          );
        })}

        {overflow > 0 && (
          <button
            type="button"
            aria-label={t.moreAria(overflow)}
            aria-haspopup="dialog"
            onClick={onOpenPicker}
            className={cn(
              BAR_PILL,
              "hidden px-3.5 hover:bg-muted lg:inline-flex",
              FOCUS_RING,
            )}
          >
            {t.more(overflow)}
          </button>
        )}

        <button
          type="button"
          aria-label={t.add}
          aria-haspopup="dialog"
          onClick={onOpenPicker}
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full border-chip border-dashed border-border text-foreground transition-colors hover:border-solid hover:bg-card",
            FOCUS_RING,
          )}
        >
          <Plus aria-hidden="true" className="size-4.5" />
        </button>
      </div>

      <Link
        href="/devices"
        className={cn(
          "ml-auto hidden min-h-11 shrink-0 items-center gap-1.5 rounded-sm px-1.5 text-sm font-semibold text-foreground underline-offset-3 hover:underline lg:inline-flex",
          FOCUS_RING,
        )}
      >
        {t.myDevices}
        <ChevronRight aria-hidden="true" className="size-4" />
      </Link>
    </>
  );
}
