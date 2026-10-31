"use client";

import type { ReactNode } from "react";
import { Ban } from "lucide-react";
import {
  useProductControllerFindAll,
  type ProductControllerFindAllParams,
} from "@/entities/product";
import { getDeviceFamilyTone } from "@/entities/device";
import { setActiveDevice, type MyDevice } from "@/entities/my-devices";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { MY_DEVICES_RADIO_LIMIT } from "../model/my-devices-filter";
import { useDeviceFilterCounts } from "../model/use-my-devices-filter";
import { ListingEmptyState } from "./listing-empty-state";

const t = dict.filters.myDevices;

interface MyDevicesEmptyStateProps {
  /** The device the listing is filtered to (`?device=` = its slug). */
  device: MyDevice;
  /** Every saved device, most recent first — the others are offered. */
  devices: readonly MyDevice[];
  /** The listing's params — every other filter stays as it is. */
  currentParams: ProductControllerFindAllParams;
  /** The current category's name, for «У «Чохли» — 12 товарів…». */
  categoryName?: string;
  onFilterChange: (updates: Record<string, string | undefined>) => void;
  /**
   * The listing's generic empty state («За цими фільтрами нічого немає» +
   * reset), shown instead when the listing is empty even WITHOUT the device
   * — then other filters, not the device, emptied it.
   */
  fallback: ReactNode;
}

/**
 * The listing is empty because nothing fits the active device (TASK-2077,
 * Catalog §14 A) — never a dead end: the device's own page, the full listing
 * with the filter off, and the other saved devices that DO have items here.
 * Mounted only once the listing came back empty, so its count requests are
 * not paid on a normal page. Checks the device-less total first: at 0 the
 * device is not the reason, and `fallback` renders instead.
 */
export function MyDevicesEmptyState({
  device,
  devices,
  currentParams,
  categoryName,
  onFilterChange,
  fallback,
}: MyDevicesEmptyStateProps) {
  const name = t.deviceName(device.name, device.label);

  const { data: totalData, isError: totalFailed } = useProductControllerFindAll(
    {
      ...currentParams,
      device: undefined,
      page: 1,
      limit: 1,
    },
  );
  const total = totalData?.meta?.total;

  const others = devices
    .filter((d) => d.modelId !== device.modelId)
    .slice(0, MY_DEVICES_RADIO_LIMIT);
  const counts = useDeviceFilterCounts(
    currentParams,
    others.map((d) => d.slug),
    true,
  );
  const withItems = others
    .map((d, i) => ({ device: d, count: counts[i] ?? 0 }))
    .filter((entry) => entry.count > 0);

  // Not the device's fault: with the device filter lifted the listing is
  // STILL empty (a keyword, a price range, «в наявності»…) — the generic
  // «nothing matches the filters» with its reset is the honest answer.
  // A failed count cannot tell either — fall back rather than spin forever.
  if (total === 0 || (total === undefined && totalFailed)) return fallback;

  // The device-less total decides which empty state this is; hold the
  // box until it is known so neither one flashes in first.
  if (total === undefined) {
    return (
      <div
        role="status"
        aria-busy="true"
        className="h-72 animate-pulse rounded-card border border-border bg-card shadow-card motion-reduce:animate-none"
      >
        <span className="sr-only">{t.emptyLoading}</span>
      </div>
    );
  }

  return (
    <ListingEmptyState
      icon={Ban}
      iconClassName={getDeviceFamilyTone(device.family).surface}
      heading={t.emptyHeading(name)}
      body={t.emptyBody(name, total, categoryName)}
      action={{
        label: t.emptyHub(device.name),
        href: `/devices/${encodeURIComponent(device.slug)}`,
      }}
      secondaryAction={{
        label: t.emptyShowAll(total),
        onClick: () => onFilterChange({ device: undefined }),
      }}
    >
      {withItems.length > 0 && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <p className="text-xs text-muted-foreground">{t.emptyOtherDevices}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {withItems.map(({ device: other, count }) => {
              const tone = getDeviceFamilyTone(other.family);
              return (
                <button
                  key={other.modelId}
                  type="button"
                  onClick={() => {
                    setActiveDevice(other.modelId);
                    onFilterChange({ device: other.slug });
                  }}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded-full border border-transparent px-4 text-sm font-semibold text-foreground outline-none transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
                    tone.surface,
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2.5 shrink-0 rounded-full",
                      tone.strong,
                    )}
                  />
                  {t.emptyOtherDevice(
                    t.deviceName(other.name, other.label),
                    count,
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </ListingEmptyState>
  );
}
