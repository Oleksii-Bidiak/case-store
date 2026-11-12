/** Catalogue filter scope — mirrors the Prisma `DeviceCompatScope` enum. */
export type CompatScope = 'active' | 'all';

export interface DeviceSettingsValue {
  compatOnly: boolean;
  compatScope: CompatScope;
}

/** One stored device as the merge and the replace see it (no enrichment). */
export interface StoredDevice {
  modelId: string;
  label: string | null;
  lastUsedAt: Date;
}

/**
 * The account side of a merge, read inside the merge transaction. `settings`
 * is `null` while the account has no settings row — the signal that the guest
 * settings should be adopted.
 */
export interface AccountDevicesSnapshot {
  devices: StoredDevice[];
  settings: DeviceSettingsValue | null;
}

/** What a replace / merge writes: the full list and the settings. */
export interface DevicesStateWrite {
  devices: StoredDevice[];
  settings: DeviceSettingsValue;
}
