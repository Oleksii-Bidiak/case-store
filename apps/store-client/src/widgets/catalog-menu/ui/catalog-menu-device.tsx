"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Smartphone } from "lucide-react";
import {
  deviceCategoryHref,
  deviceHubHref,
  getDeviceFamilyTone,
  useDeviceCategories,
  useDeviceModelCatalog,
} from "@/entities/device";
import {
  addDevice,
  toMyDeviceInput,
  useActiveDevice,
  useMyDevicesHydrated,
  type MyDevice,
} from "@/entities/my-devices";
import {
  openDevicePicker,
  popularModels,
  withFamily,
  type PickerModel,
} from "@/features/device-picker";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { CategoryIcon, Skeleton } from "@/shared/ui";
import { useXlViewport } from "../model/use-xl-viewport";
import { FOCUS_RING } from "./menu-styles";

const t = dict.catalogMenu.device;

/** Device categories in the column — the mockup's four rows. */
const DEVICE_CATEGORY_LIMIT = 4;
/** Popular model chips when no device is saved. */
const POPULAR_CHIP_COUNT = 4;

/** The column box; the tone (family or neutral) is added per state. */
const COLUMN =
  "ml-2 hidden w-67 shrink-0 flex-col gap-2.5 rounded-lg p-4.5 xl:flex";

const KICKER =
  "flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase";

const PRIMARY_PILL =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-interactive hover:bg-primary-hover hover:shadow-card active:scale-98 active:bg-primary active:shadow-none motion-reduce:active:scale-100";

interface CatalogMenuDeviceProps {
  onClose: () => void;
}

/**
 * «Ваш пристрій» — the mega menu's third column, xl only (TASK-2072). With a
 * saved device it is painted in the device's family tone and lists the root
 * categories that really have products for it (counts from the compat pages);
 * without one it offers four popular models and the full picker.
 *
 * The device list is browser-local, so the column is client-only by nature —
 * the server HTML of every ISR page stays free of it. Data requests wait for
 * an `xl` viewport: between 1024 and 1279 the column is not on screen.
 */
export function CatalogMenuDevice({ onClose }: CatalogMenuDeviceProps) {
  const hydrated = useMyDevicesHydrated();
  const device = useActiveDevice();
  const xl = useXlViewport();
  // A chip turns the «no device» column into «Ваш пристрій» in place; the
  // chip the visitor pressed is gone then, so hand focus to the new column's
  // primary link instead of letting it drop to <body>.
  const [chosenHere, setChosenHere] = useState(false);

  // The panel only opens on a click, long after hydration; this is a guard.
  if (!hydrated) return null;

  if (device) {
    return (
      <SavedDevice
        device={device}
        enabled={xl}
        onClose={onClose}
        autoFocusCta={chosenHere}
      />
    );
  }

  return (
    <NoDevice
      enabled={xl}
      onClose={onClose}
      onChoose={(model) => {
        setChosenHere(true);
        addDevice(toMyDeviceInput(model));
      }}
    />
  );
}

function SavedDevice({
  device,
  enabled,
  onClose,
  autoFocusCta,
}: {
  device: MyDevice;
  enabled: boolean;
  onClose: () => void;
  /** Focus «Все для …» on mount — the chip that had focus is gone. */
  autoFocusCta: boolean;
}) {
  const tone = getDeviceFamilyTone(device.family);
  const { categories, isLoading, isError } = useDeviceCategories(
    device.slug,
    enabled,
  );
  const shown = isError ? [] : categories.slice(0, DEVICE_CATEGORY_LIMIT);

  const ctaRef = useRef<HTMLAnchorElement | null>(null);
  // Mount-only on purpose: a later prop change must not steal focus.
  const autoFocusOnMount = useRef(autoFocusCta);
  useEffect(() => {
    if (autoFocusOnMount.current) ctaRef.current?.focus();
  }, []);

  return (
    <section
      aria-label={t.kicker}
      data-slot="catalog-menu-device"
      className={cn(COLUMN, tone.surface)}
    >
      <h3 className={KICKER}>
        <span
          aria-hidden="true"
          className={cn("size-2.5 shrink-0 rounded-full", tone.strong)}
        />
        {t.kicker}
      </h3>
      <p className="-mt-1 mb-1 font-display text-lg leading-tight font-bold">
        {device.name}
      </p>

      {isLoading && (
        <div className="flex flex-col gap-2.5" aria-hidden="true">
          {Array.from({ length: DEVICE_CATEGORY_LIMIT }, (_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-menu" />
          ))}
        </div>
      )}

      {!isLoading && shown.length > 0 && (
        <ul
          aria-label={t.categoriesAria(device.name)}
          className="flex flex-col gap-2.5"
        >
          {shown.map((category) => (
            <li key={category.id}>
              <Link
                href={deviceCategoryHref(category.slug, device.slug)}
                onClick={onClose}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-menu bg-card px-3 text-sm font-medium text-foreground transition-interactive hover:shadow-card active:scale-99 motion-reduce:active:scale-100",
                  FOCUS_RING,
                )}
              >
                <CategoryIcon
                  icon={category.icon}
                  className="size-4.5 text-muted-foreground"
                />
                <span className="min-w-0 flex-1">{category.name}</span>
                <small className="text-xs text-muted-foreground">
                  {category.productCount}
                </small>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link
        ref={ctaRef}
        href={deviceHubHref(device.slug)}
        onClick={onClose}
        className={cn("mt-1", PRIMARY_PILL, FOCUS_RING)}
      >
        {t.allFor(device.name)}
        <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
      </Link>
    </section>
  );
}

function NoDevice({
  enabled,
  onClose,
  onChoose,
}: {
  enabled: boolean;
  onClose: () => void;
  onChoose: (model: PickerModel) => void;
}) {
  const catalog = useDeviceModelCatalog({ enabled });
  const popular = useMemo(
    () => popularModels(withFamily(catalog.models), POPULAR_CHIP_COUNT),
    [catalog.models],
  );

  return (
    <section
      aria-label={t.pickKicker}
      data-slot="catalog-menu-device"
      className={cn(COLUMN, "bg-muted")}
    >
      <h3 className={KICKER}>
        <Smartphone className="size-3.5 shrink-0" aria-hidden="true" />
        {t.pickKicker}
      </h3>
      <p className="text-sm leading-normal text-muted-foreground">
        {t.pickText}
      </p>

      {/* Loading or failed: no chips at all — «Усі моделі» still opens the
          picker, which owns the retry. */}
      {!catalog.isLoading && !catalog.isError && popular.length > 0 && (
        <ul aria-label={t.popularAria} className="flex flex-wrap gap-1.5">
          {popular.map((model) => (
            <li key={model.id}>
              <button
                type="button"
                onClick={() => onChoose(model)}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-full bg-card px-3 text-sm font-semibold text-foreground transition-interactive hover:shadow-card active:scale-98 motion-reduce:active:scale-100",
                  FOCUS_RING,
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    getDeviceFamilyTone(model.family).strong,
                  )}
                />
                {model.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => {
          // The picker is a modal: close the scroll-locked panel first so the
          // two never stack.
          onClose();
          openDevicePicker();
        }}
        className={cn(PRIMARY_PILL, FOCUS_RING)}
      >
        {t.allModels}
      </button>
    </section>
  );
}
