// Pure helpers behind the «Мої пристрої» page (TASK-2076). No React, no I/O.

import type { MyDevice } from "@/entities/my-devices";

export interface DeviceGroup {
  /** Stable React key: `""` for the unlabelled «Мої» group. */
  key: string;
  /** The label as first spelled, `null` for «Мої». */
  label: string | null;
  /** In list order — the active device, when in the group, comes first. */
  devices: MyDevice[];
}

const labelKey = (label: string) => label.toLocaleLowerCase("uk-UA");

/**
 * Group saved devices by label. Unlabelled devices form «Мої», always first;
 * other groups follow in order of first appearance in the (most-recent-first)
 * list. Labels group case-insensitively — «мама» joins «Мама».
 */
export function groupDevicesByLabel(
  devices: readonly MyDevice[],
): DeviceGroup[] {
  const mine: DeviceGroup = { key: "", label: null, devices: [] };
  const byKey = new Map<string, DeviceGroup>();
  const labelled: DeviceGroup[] = [];
  for (const device of devices) {
    if (!device.label) {
      mine.devices.push(device);
      continue;
    }
    const key = labelKey(device.label);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: device.label, devices: [] };
      byKey.set(key, group);
      labelled.push(group);
    }
    group.devices.push(device);
  }
  return mine.devices.length > 0 ? [mine, ...labelled] : labelled;
}

/** Chips under the label input: labels in use first, then the defaults. */
export const LABEL_SUGGESTION_LIMIT = 5;

export function labelSuggestions(
  devices: readonly MyDevice[],
  defaults: readonly string[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const used = devices
    .map((device) => device.label)
    .filter((label): label is string => Boolean(label));
  for (const label of [...used, ...defaults]) {
    const key = labelKey(label);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length === LABEL_SUGGESTION_LIMIT) break;
  }
  return out;
}

/** The model hub of a device — «Все для iPhone 15 Pro» (TASK-1954). */
export function myDeviceHubPath(slug: string): string {
  return `/devices/${encodeURIComponent(slug)}`;
}
