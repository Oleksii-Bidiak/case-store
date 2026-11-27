import type { CompatScope } from '../../../src/my-devices/my-devices.types';

/**
 * «Мої пристрої» of the demo customers (TASK-2569).
 *
 * `hoursAgo` sets `lastUsedAt` relative to the run, and the device with the
 * latest `lastUsedAt` is the account's active one — exactly how the storefront
 * picks it. `settings` absent = no `UserDeviceSettings` row, which is itself a
 * state the domain distinguishes (the guest settings win on the next merge).
 */
export interface SeedUserDevice {
  /** `slug` of a model from `devices.data.ts`. */
  modelSlug: string;
  label: string | null;
  hoursAgo: number;
}

export interface SeedUserDevicePlan {
  email: string;
  devices: SeedUserDevice[];
  settings?: { compatOnly: boolean; compatScope: CompatScope };
}

export const userDevicePlans: SeedUserDevicePlan[] = [
  {
    email: 'customer@store.com',
    devices: [
      { modelSlug: 'iphone-15-pro', label: null, hoursAgo: 2 },
      { modelSlug: 'ipad-air-11-m2', label: 'Робочий планшет', hoursAgo: 3 * 24 },
      { modelSlug: 'galaxy-s24', label: 'Мама', hoursAgo: 12 * 24 },
    ],
    settings: { compatOnly: true, compatScope: 'all' },
  },
  {
    email: 'oksana@example.com',
    devices: [
      { modelSlug: 'redmi-note-13-pro', label: null, hoursAgo: 26 },
      { modelSlug: 'apple-watch-series-10-42mm', label: 'Годинник', hoursAgo: 5 * 24 },
    ],
    settings: { compatOnly: false, compatScope: 'active' },
  },
  {
    email: 'taras@example.com',
    devices: [{ modelSlug: 'galaxy-s24-ultra', label: null, hoursAgo: 4 * 24 }],
  },
];
