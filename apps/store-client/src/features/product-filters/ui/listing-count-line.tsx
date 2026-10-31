import { getDeviceFamilyTone } from "@/entities/device";
import type { MyDevice } from "@/entities/my-devices";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

export interface ListingCountLineProps {
  /** Products the listing shows with every filter applied. */
  shown: number | undefined;
  /** Products in the category (route locks only, no facets). */
  total: number | undefined;
  /** The device filter is on for ONE saved device — its family dot leads. */
  device?: Pick<MyDevice, "name" | "family"> | null;
  /** The device filter is on for «Для всіх моїх» — how many devices. */
  allDevicesCount?: number;
  className?: string;
}

/** The line's text — exported for the tests and the toolbar's short count. */
export function listingCountText({
  shown,
  total,
  device,
  allDevicesCount,
}: Pick<ListingCountLineProps, "device" | "allDevicesCount"> & {
  shown: number;
  total: number;
}): string {
  const line = dict.catalog.countLine(shown, Math.max(total, shown));
  if (device) return dict.catalog.countLineDevice(line, shown, device.name);
  if (allDevicesCount && allDevicesCount > 1) {
    return dict.catalog.countLineAllDevices(line, allDevicesCount);
  }
  return line;
}

/**
 * The count line under the catalogue H1 (Д3-2 Catalog §3): «18 з 214
 * товарів», with the device filter «12 з 56 товарів підходять до iPhone 15
 * Pro» behind the active device's family dot, or «… — для ваших 3
 * пристроїв». A live region, so a filter change is announced once, here.
 * Holds its line height while the numbers are unknown — no shift when they
 * land.
 */
export function ListingCountLine({
  shown,
  total,
  device,
  allDevicesCount,
  className,
}: ListingCountLineProps) {
  const ready = shown !== undefined && total !== undefined;
  return (
    <p
      aria-live="polite"
      className={cn(
        "flex min-h-5 flex-wrap items-center gap-2 text-sm text-muted-foreground",
        className,
      )}
    >
      {ready && device && (
        <span
          aria-hidden="true"
          data-testid="count-line-family-dot"
          className={cn(
            "size-2 shrink-0 rounded-full",
            getDeviceFamilyTone(device.family).strong,
          )}
        />
      )}
      {ready && (
        <span>
          {listingCountText({ shown, total, device, allDevicesCount })}
        </span>
      )}
    </p>
  );
}
