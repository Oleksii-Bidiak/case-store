"use client";

import Link from "next/link";
import { ArrowRight, Smartphone } from "lucide-react";
import type { ProductControllerFindAllParams } from "@/entities/product";
import { getDeviceFamilyTone } from "@/entities/device";
import {
  openDevicePicker,
  setActiveDevice,
  type MyDevice,
} from "@/entities/my-devices";
import { dict } from "@/shared/config";
import { Button } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import {
  MY_DEVICES_RADIO_LIMIT,
  allMyDevicesParam,
  isMyDevicesFilterOn,
  myDevicesSwitchUpdate,
} from "../model/my-devices-filter";
import {
  useDeviceFilterCounts,
  type MyDevicesFilter as MyDevicesFilterModel,
} from "../model/use-my-devices-filter";
import { useFollowPickedDevice } from "../model/use-follow-picked-device";
import { FilterCardSkeleton } from "./filter-card-skeleton";

const t = dict.filters.myDevices;

interface MyDevicesFilterProps {
  /** The panel's mode and the saved list — `useMyDevicesFilter(params.device)`. */
  filter: MyDevicesFilterModel;
  /** Current listing params: the radios' counts apply every other filter. */
  currentParams: ProductControllerFindAllParams;
  onFilterChange: (updates: Record<string, string | undefined>) => void;
  /** DOM-id / radio-name prefix — the rail and the drawer both render it. */
  idPrefix?: string;
}

/**
 * «З урахуванням моїх пристроїв» (TASK-2077) — the first block of the filter
 * rail and of the filter drawer.
 *
 * On: only what fits the active device (another saved device is one radio
 * away and becomes active), or with «Для всіх моїх» what fits at least one.
 * Off: every product. All of it is the `?device=` param — explicit slugs, so a
 * link opens the same listing in any browser (see `model/my-devices-filter`).
 * The saved list is localStorage-only: until hydration the card's box is
 * held by its placeholder, so neither state flashes in the server render.
 */
export function MyDevicesFilter({
  filter,
  currentParams,
  onFilterChange,
  idPrefix = "filter",
}: MyDevicesFilterProps) {
  const { hydrated, devices, state } = filter;
  const on = isMyDevicesFilterOn(state);

  // Radios: the most recent four — and the URL's device if a link named one
  // further down the list, so the checked radio is always on screen.
  const checkedDevice = state.mode === "active" ? state.device : null;
  let shown = devices.slice(0, MY_DEVICES_RADIO_LIMIT);
  if (checkedDevice && !shown.includes(checkedDevice)) {
    shown = [...shown.slice(0, MY_DEVICES_RADIO_LIMIT - 1), checkedDevice];
  }
  const hidden = devices.length - shown.length;
  const allParam = allMyDevicesParam(devices);
  const withAll = devices.length > 1;

  const counts = useDeviceFilterCounts(
    currentParams,
    [...shown.map((d) => d.slug), ...(withAll ? [allParam] : [])],
    hydrated && on,
  );

  // «Ще N — обрати інший»: the picker makes its pick active; follow it into
  // the URL so the grid filters by the device the header now names.
  const pickAnother = useFollowPickedDevice((picked) =>
    onFilterChange({ device: picked.slug }),
  );

  if (!hydrated) return <FilterCardSkeleton section="myDevices" />;

  const active = devices[0];
  const subtitle = !active
    ? t.subtitleNoDevice
    : state.mode === "active"
      ? t.subtitleActive
      : state.mode === "all"
        ? t.subtitleAll
        : state.mode === "other"
          ? t.subtitleOther
          : t.subtitleOff;
  const switchId = `${idPrefix}-my-devices-switch`;
  const radioName = `${idPrefix}-my-devices-scope`;

  const pickDevice = (device: MyDevice) => {
    setActiveDevice(device.modelId);
    onFilterChange({ device: device.slug });
  };

  return (
    <section
      aria-label={t.title}
      className={cn(
        "rounded-2xl border border-border p-4 shadow-card transition-colors duration-200 motion-reduce:transition-none",
        checkedDevice
          ? getDeviceFamilyTone(checkedDevice.family).surface
          : "bg-card",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3
            id={`${switchId}-label`}
            // eslint-disable-next-line tailwindcss/no-arbitrary-value -- the rail's card-title size, shared with every sibling card in product-filters.tsx
            className="font-display text-[15px] leading-snug font-bold tracking-tight text-card-foreground"
          >
            {t.title}
          </h3>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {subtitle}
          </p>
        </div>
        {active && (
          <button
            id={switchId}
            type="button"
            role="switch"
            aria-checked={on}
            aria-labelledby={`${switchId}-label`}
            onClick={() => onFilterChange(myDevicesSwitchUpdate(!on, devices))}
            className={cn(
              "relative mt-0.5 inline-flex h-7 w-11.5 shrink-0 cursor-pointer items-center rounded-full outline-none transition-all duration-200 hover:ring-4 hover:ring-foreground/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
              on ? "bg-primary" : "bg-input",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-0.75 left-0.75 size-5.5 rounded-full bg-card shadow-card transition-transform duration-200 ease-out motion-reduce:transition-none",
                on && "translate-x-4.5",
              )}
            />
          </button>
        )}
      </div>

      {!active && (
        <Button
          type="button"
          className="mt-3 h-11 w-full"
          onClick={() => openDevicePicker()}
        >
          <Smartphone aria-hidden="true" className="size-4" />
          {t.pickDevice}
        </Button>
      )}

      {active && on && (
        <div
          role="radiogroup"
          aria-label={t.radiogroupAria}
          className="mt-3 flex flex-col gap-0.5"
        >
          {shown.map((device, i) => (
            <ScopeRadio
              key={device.modelId}
              id={`${radioName}-${device.modelId}`}
              name={radioName}
              checked={checkedDevice?.modelId === device.modelId}
              label={t.deviceName(device.name, device.label)}
              dotClassName={getDeviceFamilyTone(device.family).strong}
              count={counts[i]}
              onSelect={() => pickDevice(device)}
            />
          ))}
          {hidden > 0 && (
            <button
              type="button"
              onClick={pickAnother}
              className="self-start rounded-menu py-1 pr-2 pl-9 text-left text-xs font-semibold text-muted-foreground underline-offset-3 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t.moreDevices(hidden)}
            </button>
          )}
          {withAll && (
            <ScopeRadio
              id={`${radioName}-all`}
              name={radioName}
              checked={state.mode === "all"}
              label={t.allDevices(devices.length)}
              count={counts[shown.length]}
              onSelect={() => onFilterChange({ device: allParam })}
            />
          )}
        </div>
      )}

      {active && !on && (
        <p className="mt-3 text-xs leading-snug text-muted-foreground">
          {(state.mode === "other" ? t.otherNote : t.offNote)(
            t.deviceName(active.name, active.label),
          )}
        </p>
      )}

      <Link
        href="/devices"
        className="mt-3 inline-flex items-center gap-1 rounded-sm px-1.5 text-sm font-semibold text-foreground underline-offset-3 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t.manage}
        <ArrowRight aria-hidden="true" className="size-3.5" />
      </Link>
    </section>
  );
}

interface ScopeRadioProps {
  id: string;
  name: string;
  checked: boolean;
  label: string;
  /** Family dot (`bg-family-*-strong`); absent for «Для всіх моїх». */
  dotClassName?: string;
  count: number | undefined;
  onSelect: () => void;
}

/**
 * One row of the «Для якого пристрою» group: a native radio (arrow keys, Space,
 * announced state for free) under a painted ring, like `FilterCheckbox`.
 */
function ScopeRadio({
  id,
  name,
  checked,
  label,
  dotClassName,
  count,
  onSelect,
}: ScopeRadioProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-menu px-2 py-1.5 text-sm transition-colors motion-reduce:transition-none",
        checked
          ? "bg-card/70 font-bold text-foreground hover:bg-card"
          : "font-medium text-foreground hover:bg-muted",
      )}
    >
      <input
        id={id}
        type="radio"
        name={name}
        className="peer sr-only"
        checked={checked}
        onChange={onSelect}
      />
      <span
        aria-hidden="true"
        className={cn(
          "size-4.5 shrink-0 rounded-full bg-card transition-all duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 motion-reduce:transition-none",
          checked ? "border-6 border-primary" : "border-2 border-input",
        )}
      />
      {dotClassName && (
        <span
          aria-hidden="true"
          className={cn("size-2.5 shrink-0 rounded-full", dotClassName)}
        />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && (
        <>
          <span
            aria-hidden="true"
            className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums"
          >
            {count}
          </span>
          <span className="sr-only">{t.countAria(count)}</span>
        </>
      )}
    </label>
  );
}
