"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getDeviceFamilyTone } from "@/entities/device";
import type { MyDevice } from "@/entities/my-devices";
import { deviceShortName } from "@/features/device-fit";
import {
  FilterCardSkeleton,
  MyDevicesSwitch,
} from "@/features/product-filters";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

interface WishlistDevicesPanelProps {
  /** `false` until the device store hydrates — the card holds its box. */
  hydrated: boolean;
  /** Saved devices, active first. */
  devices: readonly MyDevice[];
  /** The switch position (`WishlistFilterState.devicesOnly`). */
  on: boolean;
  onChange: (on: boolean) => void;
  /** DOM-id prefix — the rail and the drawer both render the panel. */
  idPrefix: string;
}

/**
 * «З урахуванням моїх пристроїв» on `/wishlist` (TASK-1300, Д3-2 Wishlist
 * §18.3) — the catalogue panel's shell, simpler: a switch, no radios, no
 * «Обрати пристрій». OFF by default, because a wishlist holds things for the
 * whole family; on, it keeps what fits ANY saved device. The panel takes the
 * device's family tone only when it is on for exactly one device — the same
 * rule as the catalogue, where the tint means «filtered for this device».
 */
export function WishlistDevicesPanel({
  hydrated,
  devices,
  on,
  onChange,
  idPrefix,
}: WishlistDevicesPanelProps) {
  if (!hydrated) return <FilterCardSkeleton section="myDevices" />;

  const t = dict.wishlist.devices;
  const hasDevice = devices.length > 0;
  const single = devices.length === 1 ? devices[0] : null;
  const subtitle = !hasDevice
    ? t.subNoDevice
    : !on
      ? t.subOff
      : single
        ? t.subOne(deviceShortName(single.name))
        : t.subMany(devices.length);
  const switchId = `${idPrefix}-devices-switch`;

  return (
    <section
      aria-label={dict.filters.myDevices.title}
      className={cn(
        "rounded-2xl border border-border p-4 shadow-card transition-colors duration-200 motion-reduce:transition-none",
        on && single ? getDeviceFamilyTone(single.family).surface : "bg-card",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3
            id={`${switchId}-label`}
            className="font-display text-base leading-snug font-bold tracking-tight text-card-foreground"
          >
            {dict.filters.myDevices.title}
          </h3>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {subtitle}
          </p>
        </div>
        {hasDevice && (
          <MyDevicesSwitch
            id={switchId}
            labelledBy={`${switchId}-label`}
            checked={on}
            onCheckedChange={onChange}
          />
        )}
      </div>

      <Link
        href="/devices"
        className="mt-3 inline-flex min-h-6 items-center gap-1 rounded-sm px-1.5 text-sm font-semibold text-foreground underline-offset-3 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        {dict.filters.myDevices.manage}
        <ArrowRight aria-hidden="true" className="size-3.5" />
      </Link>
    </section>
  );
}
