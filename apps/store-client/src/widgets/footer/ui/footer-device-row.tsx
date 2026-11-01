"use client";

import Link from "next/link";
import { ArrowRight, Smartphone } from "lucide-react";

import { getDeviceFamilyTone, useDeviceModelCatalog } from "@/entities/device";
import { useMyDevices, useMyDevicesHydrated } from "@/entities/my-devices";
import { deviceHubHref } from "@/features/device-fit";
import { openDevicePicker } from "@/features/device-picker";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

import { FOOTER_PILL } from "./footer-styles";

const t = dict.footer.device;

const ROW =
  "mb-2 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg bg-footer-foreground/8 px-4 py-3.5 md:pl-6";
const LEAD = "min-w-0 grow basis-64 text-sm leading-snug md:text-base";
const DIM = "text-footer-foreground/70";

/**
 * «Мої пристрої» row of the footer (TASK-2078). Client-only: the saved devices
 * live in localStorage (plan SД3 — no cookie, so the cached HTML carries no
 * personal content). The server and the hydration render draw the no-device
 * row invisibly to hold its height; once the store is read it shows the active
 * device with «Все для …» → its hub and «Мої пристрої» → /devices, or the
 * «Обрати пристрій» button that opens the one site-wide picker (TASK-2070).
 */
export function FooterDeviceRow() {
  const hydrated = useMyDevicesHydrated();
  const devices = useMyDevices();
  const device = devices[0] ?? null;
  // Shared cache entry with the header picker — no extra request in practice.
  // Only a known 0 hides the hub pill: the hub 404s for a model with no goods.
  const catalog = useDeviceModelCatalog({ enabled: device !== null });
  const productCount = device
    ? catalog.models.find((model) => model.id === device.modelId)?.productCount
    : undefined;

  if (!hydrated || !device) {
    return (
      <div
        aria-label={hydrated ? t.aria : undefined}
        aria-hidden={hydrated ? undefined : true}
        role={hydrated ? "group" : undefined}
        className={cn(ROW, !hydrated && "invisible")}
      >
        <p className={LEAD}>
          <strong className="font-semibold">{t.emptyLead}</strong>{" "}
          <span className={DIM}>{t.emptyText}</span>
        </p>
        <button
          type="button"
          tabIndex={hydrated ? undefined : -1}
          onClick={() => openDevicePicker()}
          className={FOOTER_PILL}
        >
          <Smartphone className="size-4" aria-hidden="true" />
          {t.choose}
        </button>
      </div>
    );
  }

  const tone = getDeviceFamilyTone(device.family);
  const others = devices.length - 1;

  return (
    <div role="group" aria-label={t.aria} className={ROW}>
      <p className={LEAD}>
        <span className={DIM}>{t.activeLead}</span>{" "}
        <strong className="font-semibold">{device.name}</strong>
        {others > 0 && <span className={DIM}>{t.more(others)}</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        {productCount !== 0 && (
          <Link href={deviceHubHref(device.slug)} className={FOOTER_PILL}>
            <span
              aria-hidden="true"
              className={cn("size-2.5 shrink-0 rounded-full", tone.strong)}
            />
            {t.hubCta(device.name)}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        )}
        <Link href="/devices" className={FOOTER_PILL}>
          {t.myDevices}
        </Link>
      </div>
    </div>
  );
}
