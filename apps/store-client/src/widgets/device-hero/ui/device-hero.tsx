"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useDeviceModelCatalog } from "@/entities/device";
import {
  addDevice,
  openDevicePicker,
  toMyDeviceInput,
  useMyDevices,
  useMyDevicesHydrated,
  type MyDevice,
} from "@/entities/my-devices";
import { withFamily, type PickerModel } from "@/features/device-picker";
import { cn } from "@/shared/lib/utils";
import { Skeleton } from "@/shared/ui";

import { deviceHubHref, hasHub } from "../model/hero-models";
import { HeroDevicePanel, type DeviceHeroPicks } from "./hero-device-panel";
import { HeroPicker } from "./hero-picker";
import { HERO_PANEL } from "./hero-styles";

interface DeviceHeroProps {
  /**
   * The active device's product rail (state B). The page passes product
   * cards here — their buy / wishlist actions are another widget. Omitted →
   * the panel is text only.
   */
  renderPicks?: (picks: DeviceHeroPicks) => ReactNode;
  className?: string;
}

/**
 * The homepage first block (TASK-1952). One slot, two states, the page h1 in
 * either:
 *   - no saved device → the picker: «Для якого пристрою шукаєте?», model
 *     search with typo-tolerant suggestions, popular model tiles by family,
 *     «Усі моделі» → the shared device picker (TASK-2070);
 *   - a device saved → the active device's panel in its family tone.
 * Choosing a model (tile, suggestion, or in the picker opened from here)
 * saves it as the active device and goes on to its hub `/devices/<slug>`.
 *
 * Device state is browser-local, so the server renders the neutral picker
 * (cached HTML holds nothing personal). Until hydration, a returning
 * shopper — `html[data-has-device]`, set before paint by the header's device
 * bar — sees a panel-shaped placeholder instead of a picker that would flash
 * and swap.
 *
 * Not wrapped in a page container: the page places it.
 */
export function DeviceHero({ renderPicks, className }: DeviceHeroProps) {
  const router = useRouter();
  const devices = useMyDevices();
  const hydrated = useMyDevicesHydrated();
  const catalog = useDeviceModelCatalog();
  const models = useMemo(() => withFamily(catalog.models), [catalog.models]);

  // The picker reports its choice after it closes; read the latest list then.
  const modelsRef = useRef<readonly PickerModel[]>(models);
  useEffect(() => {
    modelsRef.current = models;
  }, [models]);

  const save = (model: PickerModel) => addDevice(toMyDeviceInput(model));

  const goToHub = (slug: string, productCount: number | undefined) => {
    if (hasHub(productCount)) router.push(deviceHubHref(slug));
  };

  const choose = (model: PickerModel) => {
    save(model);
    goToHub(model.slug, model.productCount);
  };

  const openPicker = (query?: string) =>
    openDevicePicker({
      query: query || undefined,
      onChoose: (device: MyDevice) =>
        goToHub(
          device.slug,
          modelsRef.current.find((m) => m.id === device.modelId)?.productCount,
        ),
    });

  const active = devices[0];

  if (hydrated && active) {
    return (
      <div className={className}>
        <HeroDevicePanel
          devices={devices}
          productCount={
            catalog.isLoading && models.length === 0
              ? undefined
              : (models.find((m) => m.id === active.modelId)?.productCount ?? 0)
          }
          onOpenPicker={() => openPicker()}
          renderPicks={renderPicks}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      <HeroPicker
        models={models}
        isLoading={catalog.isLoading}
        isError={catalog.isError}
        onRetry={catalog.retry}
        onChoose={choose}
        onSave={save}
        onOpenPicker={openPicker}
        className={hydrated ? undefined : "[html[data-has-device]_&]:hidden"}
      />
      {!hydrated && <PanelPlaceholder />}
    </div>
  );
}

/** State B's frame before hydration, for a shopper with a saved device. */
function PanelPlaceholder() {
  return (
    <div
      aria-hidden="true"
      data-slot="device-hero-panel-reserve"
      className={cn(
        HERO_PANEL,
        "hidden bg-muted [html[data-has-device]_&]:grid",
      )}
    >
      <div className="flex flex-col items-start">
        <Skeleton className="h-5 w-44 rounded-sm bg-card/70" />
        <Skeleton className="mt-1.5 h-9 w-72 max-w-full rounded-sm bg-card/70 md:h-10" />
        <Skeleton className="mt-1.5 h-5 w-80 max-w-full rounded-sm bg-card/70" />
        <Skeleton className="mt-4.5 h-13 w-60 max-w-full rounded-cta bg-card/70" />
        <div className="mt-4 flex gap-1.5">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-28 rounded-full bg-card/70" />
          ))}
        </div>
      </div>
    </div>
  );
}
