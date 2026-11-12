// Local «Мої пристрої» ↔ the account API shape (TASK-1959).

import { getDeviceFamily } from "@/entities/device/model/device-family";
import type { MyDevice, MyDevicesSettings } from "@/entities/my-devices";
import type {
  MyDeviceEntity,
  MyDevicesDto,
  MyDevicesSettingsEntity,
} from "@/shared/api/generated/models";

/** The API's bound on one request body (`ArrayMaxSize(100)` on the server). */
export const MAX_ACCOUNT_DEVICES = 100;

/** Account rows → the local list. The family is resolved as on add. */
export function toLocalDevices(devices: readonly MyDeviceEntity[]): MyDevice[] {
  const out: MyDevice[] = [];
  for (const d of devices) {
    const lastUsedAt = Date.parse(d.lastUsedAt);
    if (!Number.isFinite(lastUsedAt)) continue;
    const device: MyDevice = {
      modelId: d.modelId,
      slug: d.slug,
      name: d.name,
      brandName: d.brandName,
      family: getDeviceFamily({
        brandName: d.brandName,
        brandSlug: d.brandSlug,
        series: d.series,
        name: d.name,
      }),
      lastUsedAt,
    };
    if (d.label) device.label = d.label;
    out.push(device);
  }
  return out;
}

export function toLocalSettings(
  settings: MyDevicesSettingsEntity,
): MyDevicesSettings {
  return {
    compatOnly: settings.compatOnly,
    compatScope: settings.compatScope,
  };
}

/** The local state → the `PUT` / `merge` body (newest first, bounded). */
export function toAccountPayload(
  devices: readonly MyDevice[],
  settings: Readonly<MyDevicesSettings>,
): MyDevicesDto {
  return {
    devices: devices.slice(0, MAX_ACCOUNT_DEVICES).map((d) => ({
      modelId: d.modelId,
      label: d.label ?? null,
      lastUsedAt: new Date(d.lastUsedAt).toISOString(),
    })),
    settings: {
      compatOnly: settings.compatOnly,
      compatScope: settings.compatScope,
    },
  };
}
