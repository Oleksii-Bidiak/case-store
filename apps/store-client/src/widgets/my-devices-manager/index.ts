// «Мої пристрої» (TASK-2076): one block, two shells — the guest page
// `/devices` and the account section `?section=devices`.
export {
  MyDevicesManager,
  type MyDevicesManagerProps,
} from "./ui/my-devices-manager";

// The catalogue filter's defaults (TASK-2077) — the settings panel writes
// them, the catalogue reads them. localStorage `my-devices-settings:v1`.
export {
  DEFAULT_MY_DEVICES_SETTINGS,
  MY_DEVICES_SETTINGS_STORAGE_KEY,
  catalogFilterDefault,
  parseMyDevicesSettings,
  readMyDevicesSettings,
  updateMyDevicesSettings,
  type CompatScope,
  type MyDevicesSettings,
} from "./model/my-devices-settings";
// "use client" module: the barrel is imported by server pages.
export { useMyDevicesSettings } from "./model/use-my-devices-settings";
