"use client";

import { useEffect, useId, useRef, useState } from "react";

import {
  openDevicePicker,
  removeDevice,
  setActiveDevice,
  useMyDevices,
  useMyDevicesHydrated,
  type MyDevice,
} from "@/entities/my-devices";
import { PAGE_CONTAINER } from "@/shared/config";
import { Skeleton } from "@/shared/ui";

import { useDeviceCategories } from "../model/use-device-categories";
import { useWideViewport } from "../model/use-wide-viewport";
import { PRIMARY_CONTROL_ATTR } from "./bar-styles";
import { DeviceBarCategories } from "./device-bar-categories";
import { DeviceBarDevices } from "./device-bar-devices";
import { DeviceBarPanel } from "./device-bar-panel";

/** Tier 1 at every width: 44px controls with 6px above and below. */
const TIER_ONE_CLASS = `${PAGE_CONTAINER} flex min-h-14 items-center gap-3 py-1.5`;

/**
 * DeviceBar — «Мої пристрої» as the second row of the sticky header
 * (TASK-2074; the header part of TASK-1953). Two tiers, nothing scrolls:
 *
 *  - tier 1 (every width): the active device chip, the two most recent
 *    others, «ще N», «+», «Мої пристрої ›» — or «Оберіть свій пристрій»;
 *  - tier 2 (≥ 1024, only with a device): the active device's categories and
 *    «Усі категорії · N», which drops a full-width panel under the header.
 *
 * The device list lives in localStorage only (no cookie), so the server and
 * the hydration render cannot know it: they draw a 56px placeholder of the
 * exact tier-1 height, and the real tiers render once the client snapshot is
 * in use — tier 1 swaps in place without moving anything below it.
 */
export function DeviceBar() {
  const hydrated = useMyDevicesHydrated();
  const devices = useMyDevices();
  const active: MyDevice | undefined = devices[0];
  const wide = useWideViewport();
  const { categories, isLoading, isError } = useDeviceCategories(
    active?.slug,
    hydrated && wide,
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // The panel belongs to one device: keyed by its id, it closes by itself
  // when the active device changes or is forgotten — no reset effect.
  const [panelFor, setPanelFor] = useState<string | null>(null);
  const panelOpen = Boolean(active) && panelFor === active?.modelId;
  const closePanel = () => setPanelFor(null);

  useEffect(() => {
    if (!panelOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPanelFor(null);
      toggleRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPanelFor(null);
    };
    const onPopState = () => setPanelFor(null);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("popstate", onPopState);
    };
  }, [panelOpen]);

  /**
   * After a switch or a forget the pressed control is gone (a pill became the
   * chip, or the chip became the next device / the pick button). Hand focus to
   * the new primary control so a keyboard user is not dropped onto <body>.
   */
  const refocusPrimary = () => {
    requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLElement>(`[${PRIMARY_CONTROL_ATTR}]`)
        ?.focus();
    });
  };

  if (!hydrated) {
    return (
      <div className="border-t border-border">
        <div aria-hidden="true" className={TIER_ONE_CLASS}>
          <Skeleton className="h-11 w-full rounded-full min-[480px]:w-72" />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      data-slot="device-bar"
      className="relative border-t border-border font-sans text-foreground"
    >
      <div className={TIER_ONE_CLASS}>
        <DeviceBarDevices
          devices={devices}
          onOpenPicker={() => openDevicePicker()}
          onActivate={(modelId) => {
            setActiveDevice(modelId);
            refocusPrimary();
          }}
          onForget={(device) => {
            removeDevice(device.modelId);
            refocusPrimary();
          }}
        />
      </div>

      {active && !isError && (
        <DeviceBarCategories
          ref={toggleRef}
          device={active}
          categories={categories}
          isLoading={isLoading || !wide}
          panelId={panelId}
          panelOpen={panelOpen}
          onTogglePanel={() => setPanelFor(panelOpen ? null : active.modelId)}
        />
      )}

      {active && panelOpen && categories.length > 0 && (
        <DeviceBarPanel
          id={panelId}
          device={active}
          categories={categories}
          onNavigate={closePanel}
        />
      )}
    </div>
  );
}
